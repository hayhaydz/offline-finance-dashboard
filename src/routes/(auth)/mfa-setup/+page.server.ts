import crypto from "node:crypto";
import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import {
	decryptTOTPSecret,
	generateBackupCodes,
	generateOTPAuthURL,
	generateQRCode,
	verifyTOTP,
} from "$lib/auth/mfa";
import { hashPassword } from "$lib/auth/password";
import { HOME_ROUTE, LOGIN_ROUTE, REGISTER_ROUTE } from "$lib/constants/routes";
import { db } from "$lib/db/client";
import { backupCodes, sessions, users } from "$lib/db/schema";
import { ensureDefaultCategories } from "$lib/server/categories";
import { devLog, isVerboseDebug, logError, logFormData } from "$lib/server/logger";

export async function load({ cookies, locals }) {
	if (isVerboseDebug()) devLog("mfaSetup", "Loading MFA setup page");

	// Check if we just finished setup (to skip redirection)
	const justFinished = cookies.get("mfa-just-finished") === "true";

	if (justFinished) {
		// Consume the cookie
		cookies.delete("mfa-just-finished", { path: "/mfa-setup" });

		if (locals.user) {
			devLog("mfaSetup", "MFA setup just completed", {
				username: locals.user.username,
			});
			return {
				username: locals.user.username,
			};
		}
	}

	// If already logged in and not just finished setup, go to dashboard
	if (locals.user) {
		throw redirect(302, HOME_ROUTE);
	}

	// Get setup token from cookie set by registration page
	const mfaSetupToken = cookies.get("mfa-setup-token");

	if (!mfaSetupToken) {
		logError("mfaSetup", "No MFA setup token found");
		throw redirect(302, REGISTER_ROUTE);
	}

	const user = await db.query.users.findFirst({
		where: eq(users.mfaSetupToken, mfaSetupToken),
	});

	if (!user) {
		logError("mfaSetup", "User not found for MFA setup token");
		cookies.delete("mfa-setup-token", { path: "/" });
		throw redirect(302, REGISTER_ROUTE);
	}

	// Check if MFA is already set up (backup codes exist)
	const existingCodes = await db.query.backupCodes.findMany({
		where: eq(backupCodes.userId, user.id),
	});

	if (existingCodes.length > 0) {
		devLog("mfaSetup", "MFA already set up", { username: user.username });
		// MFA already set up, redirect to login (since not logged in here)
		cookies.delete("mfa-setup-token", { path: "/" });
		throw redirect(302, LOGIN_ROUTE);
	}

	// Decrypt TOTP secret before generating QR code
	const systemKey = process.env.ENCRYPTION_KEY;
	if (!systemKey) {
		logError("mfaSetup", "Server configuration error - missing ENCRYPTION_KEY");
		throw error(500, "Server configuration error");
	}

	const totpSecretPlaintext = decryptTOTPSecret(
		user.totpSecret,
		user.totpSecretIV,
		systemKey,
	);

	// Generate QR code using decrypted secret
	const otpauthURL = generateOTPAuthURL(totpSecretPlaintext, user.username);
	const qrCodeUrl = await generateQRCode(otpauthURL);

	devLog("mfaSetup", "QR code generated", { username: user.username });

	// Set flag proving the user loaded the setup page and received the QR code.
	// The finalize action checks for this to prevent bypassing the setup flow.
	cookies.set("mfa-setup-initiated", "true", {
		path: "/mfa-setup",
		httpOnly: true,
		sameSite: "strict",
		secure: process.env.APP_ENV === "production",
		maxAge: 60 * 15, // Same 15-min window as the setup token
	});

	return {
		qrCodeUrl,
		manualKey: totpSecretPlaintext,
		username: user.username,
	};
}

export const actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		logFormData("mfaSetup", Object.fromEntries(formData));

		const totpCode = formData.get("totpCode") as string;

		if (!totpCode) {
			devLog("mfaSetup", "Validation failed - missing TOTP code");
			return fail(400, { error: "Authentication code is required" });
		}

		// Verify the user actually loaded the setup page (saw the QR code).
		// Without this check, anyone with the setup token could POST directly
		// to finalize MFA without completing the setup flow.
		const setupInitiated = cookies.get("mfa-setup-initiated");
		if (!setupInitiated) {
			logError("mfaSetup", "Finalize attempted without setup initiation");
			return fail(403, {
				error: "MFA setup not initiated. Please start from the registration page.",
			});
		}

		// Get setup token from cookie
		const mfaSetupToken = cookies.get("mfa-setup-token");
		if (!mfaSetupToken) {
			logError("mfaSetup", "Session expired - no MFA setup token");
			return fail(400, {
				error: "Session expired. Please start registration again.",
			});
		}

		const user = await db.query.users.findFirst({
			where: eq(users.mfaSetupToken, mfaSetupToken),
		});

		if (!user) {
			logError("mfaSetup", "User not found for MFA setup");
			cookies.delete("mfa-setup-token", { path: "/" });
			return fail(400, { error: "User not found. Please register again." });
		}

		// Decrypt TOTP secret before verifying
		const systemKey = process.env.ENCRYPTION_KEY;
		if (!systemKey) {
			logError(
				"mfaSetup",
				"Server configuration error - missing ENCRYPTION_KEY",
			);
			return fail(500, { error: "Server configuration error" });
		}

		const totpSecretPlaintext = decryptTOTPSecret(
			user.totpSecret,
			user.totpSecretIV,
			systemKey,
		);

		// Verify TOTP code using decrypted secret
		const isValid = await verifyTOTP(totpCode, totpSecretPlaintext);

		if (!isValid) {
			logError("mfaSetup", "TOTP verification failed", {
				username: user.username,
			});
			return fail(400, {
				error: "Invalid authentication code. Please try again.",
			});
		}

		devLog("mfaSetup", "TOTP verification successful", {
			username: user.username,
		});

		// Generate and store backup codes
		const newBackupCodes = generateBackupCodes();
		for (const code of newBackupCodes) {
			const hashedCode = await hashPassword(code);
			await db.insert(backupCodes).values({
				userId: user.id,
				code: hashedCode,
				used: false,
				createdAt: new Date(),
			});
		}

		devLog("mfaSetup", "Backup codes generated", {
			username: user.username,
			codeCount: newBackupCodes.length,
		});

		// Seed default spending categories for new user (idempotent — no-op if user already has categories)
		await ensureDefaultCategories(user.id);

		// Mark the setup token as used in database
		await db
			.update(users)
			.set({ mfaSetupToken: null, updatedAt: new Date() })
			.where(eq(users.id, user.id));

		// Clear the setup cookies
		cookies.delete("mfa-setup-token", { path: "/" });
		cookies.delete("mfa-setup-initiated", { path: "/mfa-setup" });

		// Create session and log user in (auto-login after MFA setup)
		const sessionToken = crypto.randomBytes(32).toString("hex");

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

		devLog("mfaSetup", "MFA setup completed, user logged in", {
			username: user.username,
			userId: user.id,
		});

		// Set a temporary cookie to signal the load function that we just finished setup
		cookies.set("mfa-just-finished", "true", {
			path: "/mfa-setup",
			httpOnly: true,
			maxAge: 10, // 10 seconds is plenty for the re-run
		});

		// Return backup codes to client to show them one last time
		return {
			success: true,
			backupCodes: newBackupCodes,
		};
	},
};
