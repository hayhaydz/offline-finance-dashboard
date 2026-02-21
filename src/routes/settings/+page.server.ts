import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logError } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	// Redirect to profile as the default settings page
	redirect(302, '/settings/profile');
};
