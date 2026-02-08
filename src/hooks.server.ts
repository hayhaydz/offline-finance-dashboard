import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { sessions, users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname, hostname } = event.url;

	// SECURITY: Host Header Validation
	// Prevent LAN exposure by ensuring the request is targeted at localhost.
	// This allows Windows <-> WSL2 communication via localhost forwarding
	// while blocking external network access.

  const allowedClientIps = new Set(['127.0.0.1', '::1']);

  const clientIp = event.getClientAddress();
  if (!allowedClientIps.has(clientIp)) {
    return new Response('Forbidden: local access only.', { status: 403 });
  }

  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // Log the attempt
      console.error(`Blocked external access: ${hostname}`);
      return new Response('Forbidden', { status: 403 });
  }

	// Define route types
	const isAuthRoute = pathname.startsWith('/login') || 
	                    pathname.startsWith('/register') || 
	                    pathname.startsWith('/mfa-setup');
	
	const isProtectedRoute = pathname.startsWith('/accounts') || 
	                         pathname.startsWith('/settings') || 
	                         pathname.startsWith('/snapshots') || 
	                         pathname.startsWith('/app');

	// Get session token from HTTP-only cookie
	const sessionToken = event.cookies.get('session');

	if (!sessionToken) {
		if (isProtectedRoute) {
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
		event.cookies.delete('session', { path: '/' });
		if (isProtectedRoute) {
			throw redirect(302, '/login');
		}
		return resolve(event);
	}

	// Check session expiration (24-hour inactivity)
	const twentyFourHours = 24 * 60 * 60 * 1000;
	if (Date.now() - session.lastActivity.getTime() > twentyFourHours) {
		await db.delete(sessions).where(eq(sessions.token, sessionToken));
		event.cookies.delete('session', { path: '/' });
		if (isProtectedRoute) {
			throw redirect(302, '/login');
		}
		return resolve(event);
	}

	// If logged in and trying to access auth routes (except mfa-setup which might be needed)
	if (isAuthRoute && !pathname.startsWith('/mfa-setup')) {
		throw redirect(302, '/accounts');
	}

	// Session valid - update last activity
	await db
		.update(sessions)
		.set({ lastActivity: new Date() })
		.where(eq(sessions.token, sessionToken));

	// Populate locals with user data
	event.locals.user = session.user;
	event.locals.session = session;

	return resolve(event);
};
