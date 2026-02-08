import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { devLog, logError, logFormData } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError('profile', 'Authentication required');
		devLog('profile', 'Redirecting to login - not authenticated');
		throw redirect(302, '/login');
	}

	devLog('profile', 'Profile settings loaded', {
		username: locals.user.username,
		userId: locals.user.id
	});

	return {
		user: locals.user,
		session: locals.session
	};
};
