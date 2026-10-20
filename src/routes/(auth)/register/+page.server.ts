import crypto from "node:crypto";
import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashPassword } from "$lib/auth/password";
import { db } from "$lib/db/client";
import { users } from "$lib/db/schema";
import { enrollPasswordSlot } from "$lib/server/crypto/enroll";
import { unlockKeyring } from "$lib/server/crypto/keyring";
import {
	devLog,
	isVerboseDebug,
	logError,
	logFormData,
} from "$lib/server/logger";

export const actions = {
	default: async ({ request, cookies }) => {
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

			if (isVerboseDebug())
				devLog("register", "Validation passed", { username });

			// Envelope enrollment (design D1/D2):
			// 1. random 256-bit DataKey — encrypts the user's data, never stored raw
			// 2. password slot = DataKey wrapped under Argon2id(password, salt)→HKDF
			// 3. recovery paper slot — REQUIRED, enrolled in the same session
			//    (next screen; wallet consequences stated before acceptance)
			const passwordSalt = crypto.randomBytes(16).toString("hex");
			const passwordHash = await hashPassword(password);

			const [newUser] = await db
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
				.returning();

			const { dataKey } = await enrollPasswordSlot(db, {
				userId: newUser.id,
				password,
				passwordSalt,
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
			cookies.set("recovery-enroll-user", String(newUser.id), {
				path: "/",
				httpOnly: true,
				sameSite: "strict",
				secure: process.env.APP_ENV === "production",
				maxAge: 60 * 15, // 15 minutes to complete enrollment
			});
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
