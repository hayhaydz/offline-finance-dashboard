import crypto from "node:crypto";
import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashPassword } from "$lib/auth/password";
import { issueRecoveryEnrollment } from "$lib/server/auth/recovery-enroll-token";
import { db } from "$lib/db/client";
import { credentialSlots, users } from "$lib/db/schema";
import { unlockKeyring } from "$lib/server/crypto/keyring";
import {
	generateDataKey,
	generateSlotId,
	wrapSlot,
} from "$lib/server/crypto/envelope";
import { derivePasswordSlotKey } from "$lib/server/crypto/slot-keys";
import {
	checkRegistrationRateLimit,
	recordRegistrationAttempt,
} from "$lib/security/rate-limiter";
import {
	devLog,
	isVerboseDebug,
	logError,
	logFormData,
} from "$lib/server/logger";

export const actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		try {
			const formData = await request.formData();
			logFormData("register", Object.fromEntries(formData));

			const username = formData.get("username") as string;
			const password = formData.get("password") as string;
			const confirmPassword = formData.get("confirmPassword") as string;

			// Basic validation
			if (!username || !password || !confirmPassword) {
				devLog("register", "Validation failed - missing fields", { username });
				return fail(400, { error: "All fields are required" });
			}

			if (password !== confirmPassword) {
				devLog("register", "Validation failed - passwords do not match", {
					username,
				});
				return fail(400, { error: "Passwords do not match" });
			}

			if (username.length < 3 || username.length > 50) {
				devLog("register", "Validation failed - username length", {
					username,
					length: username.length,
				});
				return fail(400, { error: "Username must be 3-50 characters" });
			}

			if (password.length < 12) {
				devLog("register", "Validation failed - password too short", {
					username,
				});
				return fail(400, { error: "Password must be at least 12 characters" });
			}

			// Username pattern validation
			const usernamePattern = /^[a-zA-Z0-9_-]+$/;
			if (!usernamePattern.test(username)) {
				devLog("register", "Validation failed - invalid username pattern", {
					username,
				});
				return fail(400, {
					error:
						"Username can only contain letters, numbers, underscore, and hyphen",
				});
			}

			// Check if username already exists
			const existingUser = await db.query.users.findFirst({
				where: eq(users.username, username),
			});

			if (existingUser) {
				devLog("register", "Username already taken", { username });
				return fail(400, { error: "Username already taken" });
			}

			// IP-scoped registration cap (auth-session-hardening): ~10
			// attempts/hour per client IP — counted only for submissions that
			// passed validation (validation errors create nothing).
			const clientIp = getClientAddress();
			if (!checkRegistrationRateLimit(clientIp)) {
				logError("register", "Registration rate limit exceeded", {
					clientIp,
				});
				return fail(429, {
					error: "Too many registrations from this address — try again later",
				});
			}
			recordRegistrationAttempt(clientIp);

			if (isVerboseDebug())
				devLog("register", "Validation passed", { username });

			// Envelope enrollment (design D1/D2):
			// 1. random 256-bit DataKey — encrypts the user's data, never stored raw
			// 2. password slot = DataKey wrapped under Argon2id(password, salt)→HKDF
			// 3. recovery paper slot — REQUIRED, enrolled in the same session
			//    (next screen; wallet consequences stated before acceptance)
			//
			// Atomic account creation (spec envelope-encryption): the user row
			// and its password slot commit in ONE synchronous transaction — a
			// slot-enrollment failure rolls the user insert back, leaving the
			// username available (no partial account that bricks against the
			// fixed /migrate). Argon2id runs BEFORE the transaction; wrapSlot
			// is sync node:crypto and runs inside it.
			const passwordSalt = crypto.randomBytes(16).toString("hex");
			const passwordHash = await hashPassword(password);
			const dataKey = generateDataKey();
			const slotKey = await derivePasswordSlotKey(password, passwordSalt);

			const newUser = db.transaction((tx) => {
				const [row] = tx
					.insert(users)
					.values({
						username,
						passwordHash,
						passwordSalt,
						// Legacy TOTP columns (dropped in the 5.3 release step): inert
						// placeholder values satisfy NOT NULL for fresh accounts.
						totpSecret: "REMOVED",
						totpSecretIV: "REMOVED",
						createdAt: new Date(),
					})
					.returning()
					.all();

				const slotId = generateSlotId();
				const wrapped = wrapSlot(dataKey, slotKey, {
					kind: "password",
					userId: row.id,
					slotId,
				});
				tx.insert(credentialSlots)
					.values({
						slotId,
						userId: row.id,
						kind: "password",
						wrappedKey: wrapped.wrappedKey,
						iv: wrapped.iv,
						metadata: { label: "Password" },
						createdAt: new Date(),
					})
					.run();
				return row;
			});

			// Unlock immediately — registration session starts unsealed.
			unlockKeyring(newUser.id, dataKey);

			if (isVerboseDebug()) {
				devLog("register", "User created with envelope keyring", {
					username,
					userId: newUser.id,
				});
			}

			// Recovery enrollment is REQUIRED in the same session (spec
			// recovery-credentials: "Migration cannot skip recovery enrollment").
			// The handoff cookie carries a capability TOKEN (server-mapped),
			// never the raw user id.
			issueRecoveryEnrollment(cookies, newUser.id);
		} catch (error) {
			// SvelteKit's redirect() throws an error with status code - let it through
			if (
				error &&
				typeof error === "object" &&
				"status" in error &&
				error.status === 302
			) {
				throw error; // Re-throw redirect exceptions
			}
			logError("register", "Unexpected error during registration", error);
			return fail(500, { error: "An error occurred during registration" });
		}

		// Redirect to recovery enrollment — required before the app is usable
		throw redirect(302, "/recovery-enroll?mode=register");
	},
};
