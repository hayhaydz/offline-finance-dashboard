import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { sessions, users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

export const handle: Handle = async ({ event, resolve }) => {
	// Get session token from HTTP-only cookie
	const sessionToken = event.cookies.get('session');

	if (!sessionToken) {
		// No session, redirect to login for protected routes
		if (event.url.pathname.startsWith('/app')) {
			throw redirect(302, '/login');
		}
		return resolve(event);
	}

	// Validate session with database
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.token, sessionToken),
		with: {
			user: true
		}
	});

	if (!session) {
		// Invalid session
		event.cookies.delete('session', { path: '/' });
		if (event.url.pathname.startsWith('/app')) {
			throw redirect(302, '/login');
		}
		return resolve(event);
	}

	// Check session expiration (24-hour inactivity)
	const twentyFourHours = 24 * 60 * 60 * 1000;
	if (Date.now() - session.lastActivity.getTime() > twentyFourHours) {
		// Session expired
		await db.delete(sessions).where(eq(sessions.token, sessionToken));
		event.cookies.delete('session', { path: '/' });
		if (event.url.pathname.startsWith('/app')) {
			throw redirect(302, '/login');
		}
		return resolve(event);
	}

	// Session valid - update last activity
	await db
		.update(sessions)
		.set({ lastActivity: new Date() })
		.where(eq(sessions.token, sessionToken));

	// Populate locals with user data (type-safe)
	event.locals.user = session.user;
	event.locals.session = session;

	// Also pass user to page data for client-side access
	const response = await resolve(event);
	
	// Add user to page data
	if (response && typeof response === 'object' && 'headers' in response) {
		return response;
	}
	
	return resolve(event);
};
