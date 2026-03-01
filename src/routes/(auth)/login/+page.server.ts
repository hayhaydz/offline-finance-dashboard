import crypto from "node:crypto";
import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { decryptTOTPSecret, verifyBackupCode, verifyTOTP } from "$lib/auth/mfa";
import { verifyPassword } from "$lib/auth/password";
import { HOME_ROUTE } from "$lib/constants/routes";
import { db } from "$lib/db/client";
import { backupCodes, sessions, users } from "$lib/db/schema";
import {
	checkRateLimit,
	recordFailedAttempt,
	recordSuccessfulAttempt,
} from "$lib/security/rate-limiter";
import { devLog, logError, logFormData } from "$lib/utils/logger";

export async function load({ cookies }) {
	const appEnv = process.env.APP_ENV || "unknown";
	const devAutoLogin = process.env.DEV_AUTO_LOGIN === "true";

	// Auto-login only works in development with DEV_AUTO_LOGIN enabled
	if (appEnv === "development" && devAutoLogin) {
		devLog("login", "Development auto-login initiated");

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

		devLog("login", "Development auto-login successful", {
			username: adminUser.username,
			userId: adminUser.id,
			sessionMaxAge: "30 days",
		});

		// Redirect to home page
		throw redirect(302, HOME_ROUTE);
	}

	// Return auto-login status for UI indicator
	return {
		autoLoginEnabled: appEnv === "development" && devAutoLogin,
	};
}

export const actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		logFormData("login", Object.fromEntries(formData));

		const username = formData.get("username") as string;
		const password = formData.get("password") as string;
		const totpCode = formData.get("totpCode") as string;

		// Basic validation
		if (!username || !password || !totpCode) {
			// Generic error message (prevents username enumeration)
			logError("login", "Missing required fields", { username });
			await recordFailedAttempt(username);
			return fail(400, { error: "Invalid credentials" });
		}

		// Check rate limit
		const rateLimitResult = await checkRateLimit(username);

		if (rateLimitResult.locked) {
			logError("login", "Account locked due to rate limit", { username });
			return fail(429, {
				locked: true,
				error: "Account locked due to too many failed attempts",
			});
		}

		if (rateLimitResult.delay) {
			devLog("login", "Rate limit delay applied", {
				username,
				delaySeconds: rateLimitResult.delay,
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

		// Generic error whether user exists or not (prevents username enumeration)
		if (!user) {
			logError("login", "User not found", { username });
			await recordFailedAttempt(username);
			return fail(401, { error: "Invalid credentials" });
		}

		// Verify password
		const passwordValid = await verifyPassword(user.passwordHash, password);
		if (!passwordValid) {
			logError("login", "Invalid password", { username, userId: user.id });
			await recordFailedAttempt(username);
			return fail(401, { error: "Invalid credentials" });
		}

		// Decrypt TOTP secret before verifying TOTP code
		// The secret is stored AES-256-GCM encrypted in the database
		const systemKey = process.env.ENCRYPTION_KEY;
		if (!systemKey) {
			logError("login", "Server configuration error - missing ENCRYPTION_KEY");
			return fail(500, { error: "Server configuration error" });
		}

		const totpSecretPlaintext = decryptTOTPSecret(
			user.totpSecret,
			user.totpSecretIV,
			systemKey,
		);

		// Verify TOTP code using decrypted secret
		let totpValid = await verifyTOTP(totpCode, totpSecretPlaintext);

		// If TOTP fails, try backup code verification
		let usedBackupCodeId: number | null = null;
		if (!totpValid) {
			// Query user's UNUSED backup codes
			const userBackupCodes = await db.query.backupCodes.findMany({
				where: eq(backupCodes.userId, user.id),
			});

			// Filter to only unused codes and extract hashes
			const unusedHashedCodes = userBackupCodes
				.filter((code) => !code.used)
				.map((code) => code.code);

			// Try to verify against backup codes
			if (unusedHashedCodes.length > 0) {
				const matchedHash = await verifyBackupCode(totpCode, unusedHashedCodes);
				if (matchedHash) {
					// Find the specific backup code that was used
					const usedCode = userBackupCodes.find(
						(code) => code.code === matchedHash,
					);
					if (usedCode) {
						// Mark the backup code as used
						await db
							.update(backupCodes)
							.set({ used: true })
							.where(eq(backupCodes.id, usedCode.id));
						usedBackupCodeId = usedCode.id;
						devLog("login", "Backup code used", {
							username,
							backupCodeId: usedCode.id,
						});
					}
					totpValid = true;
				}
			}
		}

		// If both TOTP and backup code verification failed
		if (!totpValid) {
			logError("login", "Invalid TOTP code", { username, userId: user.id });
			await recordFailedAttempt(username);
			return fail(401, { error: "Invalid credentials" });
		}

		// Successful login - clear failed attempts
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

		devLog("login", "Login successful", {
			username,
			userId: user.id,
			usedBackupCode: !!usedBackupCodeId,
		});

		// Redirect to home page
		throw redirect(302, HOME_ROUTE);
	},
};
