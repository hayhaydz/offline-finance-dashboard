import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users, sessions } from '$lib/db/schema';
import { devLog, logError } from '$lib/utils/logger';
import { HOME_ROUTE } from '$lib/constants/routes';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function load({ cookies }) {
	const appEnv = process.env.APP_ENV || 'unknown';

	// SECURITY: This route ONLY works in development
	if (appEnv !== 'development') {
		logError('devLogin', 'Dev login attempted in production', { appEnv });
		throw error(404, 'Not Found');
	}

	devLog('devLogin', 'Development auto-login initiated');

	// Find the admin user (created by seed script)
	const adminUser = await db.query.users.findFirst({
		where: eq(users.username, 'admin')
	});

	if (!adminUser) {
		logError('devLogin', 'Admin user not found');
		throw error(500, 'Admin user not found. Run npm run seed:standard first.');
	}

	// Create a session for the admin user
	const sessionToken = crypto.randomBytes(32).toString('hex');

	await db.insert(sessions).values({
		token: sessionToken,
		userId: adminUser.id,
		createdAt: new Date(),
		lastActivity: new Date()
	});

	// Set the session cookie
	cookies.set('session', sessionToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: false, // Development - no HTTPS
		maxAge: 60 * 60 * 24 * 30 // 30 days in development
	});

	devLog('devLogin', 'Development auto-login successful', {
		username: adminUser.username,
		userId: adminUser.id,
		sessionMaxAge: '30 days'
	});

	// Redirect to the homepage
	throw redirect(302, HOME_ROUTE);
}
