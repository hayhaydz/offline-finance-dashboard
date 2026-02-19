import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { snapshots } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { eq } from 'drizzle-orm';
import { devLog, logError, logFormData } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals, params }) => {
	// This page only handles POST, redirect GET back to list
	throw redirect(302, '/snapshots');
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) {
			logError('deleteSnapshot', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		logFormData('deleteSnapshot', request);

		devLog('deleteSnapshot', 'Delete action initiated', {
			username: locals.user.username,
			slug: params.slug
		});

		// Fetch snapshot to validate ownership
		const snapshot = await db.query.snapshots.findFirst({
			where: eq(snapshots.slug, params.slug)
		});

		if (!snapshot) {
			logError('deleteSnapshot', 'Snapshot not found', { slug: params.slug });
			return fail(404, { error: 'Snapshot not found' });
		}

		// Validate user owns this snapshot
		try {
			validateUserAccess(snapshot, locals.user, 'Snapshot');
		} catch (err) {
			logError('deleteSnapshot', 'Access denied', {
				userId: locals.user.id,
				snapshotUserId: snapshot.userId
			});
			return fail(403, { error: 'You do not have permission to delete this snapshot' });
		}

		try {
			// Hard delete the snapshot
			await db.delete(snapshots).where(eq(snapshots.slug, params.slug));

			devLog('deleteSnapshot', 'Snapshot deleted successfully', {
				slug: params.slug,
				userId: locals.user.id
			});

			throw redirect(302, '/snapshots');
		} catch (err) {
			// Re-throw redirect (success case)
			if (err && typeof err === 'object' && 'status' in err && err.status === 302) {
				throw err;
			}

			// Handle other errors
			logError('deleteSnapshot', 'Failed to delete snapshot', err);
			return fail(500, { error: 'Failed to delete snapshot. Please try again.' });
		}
	}
};
