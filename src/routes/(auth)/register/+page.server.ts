import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users } from '$lib/db/schema';
import { hashPassword } from '$lib/auth/password';
import { generateTOTPSecret, encryptTOTPSecret } from '$lib/auth/mfa';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export const actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = formData.get('username') as string;
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;

		// Basic validation
		if (!username || !password || !confirmPassword) {
			return fail(400, { error: 'All fields are required' });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match' });
		}

		if (username.length < 3 || username.length > 50) {
			return fail(400, { error: 'Username must be 3-50 characters' });
		}

		if (password.length < 12) {
			return fail(400, { error: 'Password must be at least 12 characters' });
		}

		// Username pattern validation
		const usernamePattern = /^[a-zA-Z0-9_-]+$/;
		if (!usernamePattern.test(username)) {
			return fail(400, {
				error: 'Username can only contain letters, numbers, underscore, and hyphen'
			});
		}

		// Check if username already exists
		const existingUser = await db.query.users.findFirst({
			where: eq(users.username, username)
		});

		if (existingUser) {
			return fail(400, { error: 'Username already taken' });
		}

		// Generate TOTP secret
		const totpSecret = generateTOTPSecret();

		// Generate password salt for user key derivation
		const passwordSalt = crypto.randomBytes(16).toString('hex');

		// Hash password with Argon2id
		const passwordHash = await hashPassword(password);

		// Encrypt TOTP secret with system key (or use PLAIN: prefix in loose mode)
		const systemKey = process.env.ENCRYPTION_KEY;
		const encryptionResult = encryptTOTPSecret(totpSecret, systemKey);
		const totpSecretEncrypted = encryptionResult.encrypted;
		const totpSecretIV = encryptionResult.iv;

		// Create user with hashed password and ENCRYPTED TOTP secret
		const newUser = await db
			.insert(users)
			.values({
				username,
				passwordHash,
				totpSecret: totpSecretEncrypted,
				totpSecretIV,
				passwordSalt,
				createdAt: new Date()
			})
			.returning();

		const userId = newUser[0].id;

		// Store user ID in cookie for MFA setup page
		cookies.set('mfa-setup-user-id', String(userId), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 15 // 15 minutes to complete MFA setup
		});

		// Redirect to MFA setup page
		throw redirect(302, '/mfa-setup');
	}
};
