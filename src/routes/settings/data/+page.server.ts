import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { devLog, logError } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError('settings-data', 'Authentication required');
		redirect(302, '/login');
	}

	devLog('settings-data', 'Data settings loaded', {
		username: locals.user.username,
		userId: locals.user.id
	});

	return {
		user: locals.user
	};
};
