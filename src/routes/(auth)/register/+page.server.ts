import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users } from '$lib/db/schema';
import { hashPassword } from '$lib/auth/password';
import { generateTOTPSecret, encryptTOTPSecret } from '$lib/auth/mfa';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export const actions = {
	default: async ({ request, cookies }) => {
		try {
			const formData = await request.formData();
			logFormData('register', Object.fromEntries(formData));

			const username = formData.get('username') as string;
			const password = formData.get('password') as string;
			const confirmPassword = formData.get('confirmPassword') as string;

			// Basic validation
			if (!username || !password || !confirmPassword) {
				devLog('register', 'Validation failed - missing fields', { username });
				return fail(400, { error: 'All fields are required' });
			}

			if (password !== confirmPassword) {
				devLog('register', 'Validation failed - passwords do not match', { username });
				return fail(400, { error: 'Passwords do not match' });
			}

			if (username.length < 3 || username.length > 50) {
				devLog('register', 'Validation failed - username length', {
					username,
					length: username.length
				});
				return fail(400, { error: 'Username must be 3-50 characters' });
			}

			if (password.length < 12) {
				devLog('register', 'Validation failed - password too short', { username });
				return fail(400, { error: 'Password must be at least 12 characters' });
			}

			// Username pattern validation
			const usernamePattern = /^[a-zA-Z0-9_-]+$/;
			if (!usernamePattern.test(username)) {
				devLog('register', 'Validation failed - invalid username pattern', { username });
				return fail(400, {
					error: 'Username can only contain letters, numbers, underscore, and hyphen'
				});
			}

			// Check if username already exists
			const existingUser = await db.query.users.findFirst({
				where: eq(users.username, username)
			});

			if (existingUser) {
				devLog('register', 'Username already taken', { username });
				return fail(400, { error: 'Username already taken' });
			}

			devLog('register', 'Validation passed', { username });

			// Generate TOTP secret
			const totpSecret = generateTOTPSecret();

			// Generate password salt for user key derivation
			const passwordSalt = crypto.randomBytes(16).toString('hex');

			// Generate random token for MFA setup
			const mfaSetupToken = crypto.randomBytes(32).toString('hex');

			// Hash password with Argon2id
			const passwordHash = await hashPassword(password);

			// Encrypt TOTP secret with system key (or use PLAIN: prefix in loose mode)
			const systemKey = process.env.ENCRYPTION_KEY;
			const encryptionResult = encryptTOTPSecret(totpSecret, systemKey);
			const totpSecretEncrypted = encryptionResult.encrypted;
			const totpSecretIV = encryptionResult.iv;

			// Create user with hashed password and ENCRYPTED TOTP secret
			await db
				.insert(users)
				.values({
					username,
					passwordHash,
					totpSecret: totpSecretEncrypted,
					totpSecretIV,
					passwordSalt,
					mfaSetupToken,
					createdAt: new Date()
				});

			devLog('register', 'User created successfully', {
				username,
				hasMfaSetupToken: !!mfaSetupToken
			});

			// Store setup token in cookie for MFA setup page
			cookies.set('mfa-setup-token', mfaSetupToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.APP_ENV === 'production',
				maxAge: 60 * 15 // 15 minutes to complete MFA setup
			});

			devLog('register', 'MFA setup initiated', { username });
		} catch (error) {
			// SvelteKit's redirect() throws an error with status code - let it through
			if (error && typeof error === 'object' && 'status' in error && error.status === 302) {
				throw error; // Re-throw redirect exceptions
			}
			logError('register', 'Unexpected error during registration', error);
			return fail(500, { error: 'An error occurred during registration' });
		}

		// Redirect to MFA setup page
		throw redirect(302, '/mfa-setup');
	}
};
