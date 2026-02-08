import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { users, sessions } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function load({ cookies }) {
	const appEnv = process.env.APP_ENV || 'unknown';

	// SECURITY: This route ONLY works in development
	if (appEnv !== 'development') {
		throw error(404, 'Not Found');
	}

	// Find the admin user (created by seed script)
	const adminUser = await db.query.users.findFirst({
		where: eq(users.username, 'admin')
	});

	if (!adminUser) {
		throw error(500, 'Admin user not found. Run npm run db:seed first.');
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

	// Redirect to the accounts page
	throw redirect(302, '/accounts');
}
