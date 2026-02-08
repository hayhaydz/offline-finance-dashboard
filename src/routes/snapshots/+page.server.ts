import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { devLog, logError } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError('snapshots', 'Authentication required');
		devLog('snapshots', 'Redirecting to login - not authenticated');
		throw redirect(302, '/login');
	}

	devLog('snapshots', 'Snapshots page loaded', {
		username: locals.user.username,
		userId: locals.user.id
	});

	return {
		user: locals.user
	};
};
