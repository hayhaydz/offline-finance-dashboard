import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users, sessions } from '$lib/db/schema';
import { verifyPassword } from '$lib/auth/password';
import { verifyTOTP, decryptTOTPSecret } from '$lib/auth/mfa';
import { checkRateLimit, recordFailedAttempt, recordSuccessfulAttempt } from '$lib/security/rate-limiter';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function load() {
	// If user is already logged in, hooks.server.ts will redirect to /app
	// We just return empty data here
	return {};
}

export const actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = formData.get('username') as string;
		const password = formData.get('password') as string;
		const totpCode = formData.get('totpCode') as string;

		// Basic validation
		if (!username || !password || !totpCode) {
			// Generic error message (prevents username enumeration)
			await recordFailedAttempt(username);
			return fail(400, { error: 'Invalid credentials' });
		}

		// Check rate limit
		const rateLimitResult = await checkRateLimit(username);

		if (rateLimitResult.locked) {
			return fail(429, {
				locked: true,
				error: 'Account locked due to too many failed attempts'
			});
		}

		if (rateLimitResult.delay) {
			// Return delay to client for countdown
			return fail(429, {
				delay: rateLimitResult.delay,
				error: 'Too many failed attempts. Please wait before trying again.'
			});
		}

		// Look up user by username
		const user = await db.query.users.findFirst({
			where: eq(users.username, username)
		});

		// Generic error whether user exists or not (prevents username enumeration)
		if (!user) {
			await recordFailedAttempt(username);
			return fail(401, { error: 'Invalid credentials' });
		}

		// Verify password
		const passwordValid = await verifyPassword(user.passwordHash, password);
		if (!passwordValid) {
			await recordFailedAttempt(username);
			return fail(401, { error: 'Invalid credentials' });
		}

		// Decrypt TOTP secret before verifying TOTP code
		// The secret is stored AES-256-GCM encrypted in the database
		const systemKey = process.env.ENCRYPTION_KEY;
		if (!systemKey) {
			return fail(500, { error: 'Server configuration error' });
		}

		const totpSecretPlaintext = decryptTOTPSecret(user.totpSecret, user.totpSecretIV, systemKey);

		// Verify TOTP code using decrypted secret
		const totpValid = await verifyTOTP(totpCode, totpSecretPlaintext);
		if (!totpValid) {
			await recordFailedAttempt(username);
			return fail(401, { error: 'Invalid credentials' });
		}

		// Successful login - clear failed attempts
		await recordSuccessfulAttempt(username);

		// Single session: Invalidate any existing sessions for this user
		await db.delete(sessions).where(eq(sessions.userId, user.id));

		// Generate opaque session token (32 random bytes as hex string)
		const sessionToken = crypto.randomBytes(32).toString('hex');

		// Create session in database
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

		// Redirect to app
		throw redirect(302, '/app');
	}
};
