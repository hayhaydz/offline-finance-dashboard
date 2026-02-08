import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { devLog, logError } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError('settings', 'Authentication required');
		redirect(302, '/login');
	}

	devLog('settings', 'Settings page loaded', {
		username: locals.user.username,
		userId: locals.user.id
	});

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		}
	};
};
