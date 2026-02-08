import { redirect, fail, error } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users, backupCodes, sessions } from '$lib/db/schema';
import crypto from 'crypto';
import {
	verifyTOTP,
	generateOTPAuthURL,
	generateQRCode,
	generateBackupCodes,
	decryptTOTPSecret
} from '$lib/auth/mfa';
import { hashPassword } from '$lib/auth/password';
import { eq } from 'drizzle-orm';

export async function load({ cookies }) {
	// Get user ID from cookie set by registration page
	const userId = cookies.get('mfa-setup-user-id');

	if (!userId) {
		throw redirect(302, '/register');
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, parseInt(userId))
	});

	if (!user) {
		cookies.delete('mfa-setup-user-id', { path: '/' });
		throw redirect(302, '/register');
	}

	// Check if MFA is already set up (backup codes exist)
	const existingCodes = await db.query.backupCodes.findMany({
		where: eq(backupCodes.userId, user.id)
	});

	if (existingCodes.length > 0) {
		// MFA already set up, redirect to login
		cookies.delete('mfa-setup-user-id', { path: '/' });
		throw redirect(302, '/login');
	}

	// Decrypt TOTP secret before generating QR code
	const systemKey = process.env.ENCRYPTION_KEY;
	if (!systemKey) {
		throw error(500, 'Server configuration error');
	}

	const totpSecretPlaintext = decryptTOTPSecret(user.totpSecret, user.totpSecretIV, systemKey);

	// Generate QR code using decrypted secret
	const otpauthURL = generateOTPAuthURL(totpSecretPlaintext, user.username);
	const qrCodeUrl = await generateQRCode(otpauthURL);

	return {
		qrCodeUrl,
		username: user.username
	};
}

export const actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const totpCode = formData.get('totpCode') as string;

		if (!totpCode) {
			return fail(400, { error: 'Authentication code is required' });
		}

		// Get user ID from cookie
		const userId = cookies.get('mfa-setup-user-id');
		if (!userId) {
			return fail(400, { error: 'Session expired. Please start registration again.' });
		}

		const user = await db.query.users.findFirst({
			where: eq(users.id, parseInt(userId))
		});

		if (!user) {
			cookies.delete('mfa-setup-user-id', { path: '/' });
			return fail(400, { error: 'User not found. Please register again.' });
		}

		// Decrypt TOTP secret before verifying
		const systemKey = process.env.ENCRYPTION_KEY;
		if (!systemKey) {
			return fail(500, { error: 'Server configuration error' });
		}

		const totpSecretPlaintext = decryptTOTPSecret(user.totpSecret, user.totpSecretIV, systemKey);

		// Verify TOTP code using decrypted secret
		const isValid = await verifyTOTP(totpCode, totpSecretPlaintext);

		if (!isValid) {
			return fail(400, { error: 'Invalid authentication code. Please try again.' });
		}

		// Generate and store backup codes
		const newBackupCodes = generateBackupCodes();
		for (const code of newBackupCodes) {
			const hashedCode = await hashPassword(code);
			await db.insert(backupCodes).values({
				userId: user.id,
				code: hashedCode,
				used: false,
				createdAt: new Date()
			});
		}

		// Clear the setup cookie
		cookies.delete('mfa-setup-user-id', { path: '/' });

		// Create session and log user in (auto-login after MFA setup)
		const sessionToken = crypto.randomBytes(32).toString('hex');

		await db.insert(sessions).values({
			token: sessionToken,
			userId: user.id,
			createdAt: new Date(),
			lastActivity: new Date()
		});

		// Set HTTP-only cookie with session token
		cookies.set('session', sessionToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 60 * 60 * 24 // 24 hours
		});

		// Return backup codes to client to show them one last time
		return {
			success: true,
			backupCodes: newBackupCodes
		};
	}
};
