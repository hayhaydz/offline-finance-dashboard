import crypto from "node:crypto";
import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "$lib/auth/password";
import { HOME_ROUTE } from "$lib/constants/routes";
import { db } from "$lib/db/client";
import { sessions, users } from "$lib/db/schema";
import {
	checkRateLimit,
	recordFailedAttempt,
	recordSuccessfulAttempt,
} from "$lib/security/rate-limiter";
import {
	countActiveSlots,
	hasEnvelope,
	unwrapPasswordSlot,
} from "$lib/server/crypto/enroll";
import { EnvelopeError } from "$lib/server/crypto/envelope";
import { unlockKeyring } from "$lib/server/crypto/keyring";
import {
	devLog,
	isVerboseDebug,
	logError,
	logFormData,
	logInfo,
} from "$lib/server/logger";
import { getFlash } from "$lib/server/utils/flash";
import { sanitizeRedirectTo } from "$lib/utils/redirect-to";

// Pre-computed at module load (once per server process) with the same
// Argon2id parameters as real hashes — see usage in the login action.
const DUMMY_VERIFY_HASH = await hashPassword("timing-equalizer-dummy-password");

export async function load({ cookies }) {
	const flashMessage = getFlash(cookies);
	const appEnv = process.env.APP_ENV || "unknown";
	const devAutoLogin = process.env.DEV_AUTO_LOGIN === "true";

	// Auto-login only works in development with DEV_AUTO_LOGIN enabled
	if (appEnv === "development" && devAutoLogin) {
		if (isVerboseDebug()) devLog("login", "Development auto-login initiated");

		// Find the admin user (created by seed script)
		const adminUser = await db.query.users.findFirst({
			where: eq(users.username, "admin"),
		});

		if (!adminUser) {
			logError("login", "Admin user not found for auto-login");
			// Return autoLoginEnabled flag but allow normal login to proceed
			return { autoLoginEnabled: true, autoLoginFailed: true };
		}

		// Invalidate any existing sessions for this user (single session policy)
		await db.delete(sessions).where(eq(sessions.userId, adminUser.id));

		// Generate opaque session token (32 random bytes as hex string)
		const sessionToken = crypto.randomBytes(32).toString("hex");

		// Create session in database
		await db.insert(sessions).values({
			token: sessionToken,
			userId: adminUser.id,
			createdAt: new Date(),
			lastActivity: new Date(),
		});

		// Set HTTP-only cookie with session token
		cookies.set("session", sessionToken, {
			path: "/",
			httpOnly: true,
			sameSite: "strict",
			secure: false, // Development - no HTTPS
			maxAge: 60 * 60 * 24 * 30, // 30 days in development
		});

		// Dev convenience that exercises the REAL unwrap path: unlock with the
		// seeded password. Device-enrolled users are exempt (device step is
		// mandatory) and any unwrap failure leaves the app sealed — the
		// /unlock ceremony takes over (hooks seal guard).
		try {
			const deviceSlots = await countActiveSlots(
				db,
				adminUser.id,
				"webauthn-prf",
			);
			if (deviceSlots === 0) {
				const dataKey = await unwrapPasswordSlot(db, adminUser, "password");
				unlockKeyring(adminUser.id, dataKey);
			}
		} catch (error) {
			logError("login", "Dev auto-login could not unlock keyring", {
				code: error instanceof EnvelopeError ? error.code : "unknown",
			});
		}

		if (isVerboseDebug()) {
			devLog("login", "Development auto-login successful", {
				sessionMaxAge: "30 days",
			});
		}

		// Redirect to home page
		throw redirect(302, HOME_ROUTE);
	}

	// Return auto-login status for UI indicator
	return {
		autoLoginEnabled: appEnv === "development" && devAutoLogin,
		flashMessage,
	};
}

export const actions = {
	default: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		logFormData("login", Object.fromEntries(formData));

		const username = formData.get("username") as string;
		const password = formData.get("password") as string;

		// Basic validation
		if (!username || !password) {
			// Generic error message (prevents username enumeration)
			logError("login", "Missing required fields");
			await recordFailedAttempt(username);
			return fail(400, { error: "Invalid credentials" });
		}

		// Check rate limit
		const rateLimitResult = await checkRateLimit(username);

		if (rateLimitResult.locked) {
			logError("login", "Account locked due to rate limit");
			return fail(429, {
				locked: true,
				error: "Account locked due to too many failed attempts",
			});
		}

		if (rateLimitResult.delay) {
			// Prod-visible: previously devLog (silent in production), which hid
			// the deadlock. No personal data — only operational rate-limit state.
			logInfo("login", "Login blocked: rate-limit delay", {
				delayMs: rateLimitResult.delay,
				attemptsRemaining: rateLimitResult.attemptsRemaining,
			});
			// Return delay to client for countdown
			return fail(429, {
				delay: rateLimitResult.delay,
				error: "Too many failed attempts. Please wait before trying again.",
			});
		}

		// Look up user by username
		const user = await db.query.users.findFirst({
			where: eq(users.username, username),
		});

		// Dummy hash verified when the user doesn't exist so response timing
		// matches the exists path (argon2 dominates latency). Prevents
		// username enumeration via timing side-channel. Generated with the
		// same OWASP parameters at module load to guarantee identical cost.
		const DUMMY_HASH = DUMMY_VERIFY_HASH;

		// Generic error whether user exists or not (prevents username enumeration)
		if (!user) {
			await verifyPassword(DUMMY_HASH, password);
			logError("login", "User not found");
			await recordFailedAttempt(username);
			return fail(401, { error: "Invalid credentials" });
		}

		// STEP 1 — Argon2id auth-hash verification (rate-limited gate).
		// A wrong password NEVER reaches the slot unwrap (design D2: the
		// auth hash is the verifier; unwrap failure must not be the only
		// signal, and GCM tag errors must not become an oracle).
		const passwordValid = await verifyPassword(user.passwordHash, password);
		if (!passwordValid) {
			logError("login", "Invalid password");
			await recordFailedAttempt(username);
			return fail(401, { error: "Invalid credentials" });
		}

		// Successful credential — clear failed attempts
		await recordSuccessfulAttempt(username);

		// Single session: Invalidate any existing sessions for this user
		await db.delete(sessions).where(eq(sessions.userId, user.id));

		// Generate opaque session token (32 random bytes as hex string)
		const sessionToken = crypto.randomBytes(32).toString("hex");

		// Create session in database
		await db.insert(sessions).values({
			token: sessionToken,
			userId: user.id,
			createdAt: new Date(),
			lastActivity: new Date(),
		});

		// Set HTTP-only cookie with session token
		cookies.set("session", sessionToken, {
			path: "/",
			httpOnly: true,
			sameSite: "strict",
			secure: process.env.APP_ENV === "production",
			maxAge: 60 * 60 * 24, // 24 hours
		});

		// STEP 2 — Unlock ceremony: unwrap the password slot → DataKey in
		// memory. Legacy accounts (pre-envelope, no slots yet) are routed to
		// the one-shot migration instead (task 5.1).
		const enrolled = await hasEnvelope(db, user.id);
		if (!enrolled) {
			devLog("login", "Legacy account — envelope migration required", {
				userId: user.id,
			});
			throw redirect(302, "/migrate");
		}

		// L2 (task 6.3): an enrolled device slot makes the device step
		// mandatory — the password alone must not assemble the DataKey. The
		// keyring stays sealed; the ceremony completes at /unlock.
		const deviceSlots = await countActiveSlots(db, user.id, "webauthn-prf");
		if (deviceSlots > 0) {
			devLog("login", "Device step required — routing to unlock ceremony", {
				userId: user.id,
			});
			const redirectTo = sanitizeRedirectTo(url.searchParams.get("redirectTo"));
			const params = new URLSearchParams({ reason: "sealed", device: "1" });
			if (redirectTo) params.set("redirectTo", redirectTo);
			throw redirect(302, `/unlock?${params.toString()}`);
		}

		try {
			const dataKey = await unwrapPasswordSlot(db, user, password);
			unlockKeyring(user.id, dataKey);
		} catch (error) {
			if (error instanceof EnvelopeError) {
				// Auth hash passed but the slot will not unwrap — treat as a
				// credential failure (slot belongs to a different password).
				logError("login", "Password slot unwrap failed", {
					userId: user.id,
					code: error.code,
				});
				await recordFailedAttempt(username);
				return fail(401, { error: "Invalid credentials" });
			}
			throw error;
		}

		devLog("login", "Login + unlock successful", { userId: user.id });

		// Return to the URL the user was on before expiry/logout redirected
		// them here (audit #21) — validated to stay on-origin.
		const redirectTo = sanitizeRedirectTo(url.searchParams.get("redirectTo"));
		throw redirect(302, redirectTo ?? HOME_ROUTE);
	},
};
