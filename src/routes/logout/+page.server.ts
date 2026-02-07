import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/client';
import { sessions } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

export const actions = {
	default: async ({ cookies }) => {
		// Get session token from cookie
		const sessionToken = cookies.get('session');

		if (sessionToken) {
			// Delete session from database
			await db.delete(sessions).where(eq(sessions.token, sessionToken));
		}

		// Clear session cookie
		cookies.delete('session', { path: '/' });

		// Redirect to login
		throw redirect(302, '/login');
	}
};
