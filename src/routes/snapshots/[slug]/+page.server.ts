import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { snapshots } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { eq } from 'drizzle-orm';
import { devLog, logError, logFormData } from '$lib/utils/logger';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		logError('editSnapshotNotes', 'Authentication required');
		throw redirect(302, '/login');
	}

	// Fetch snapshot to validate ownership and load current notes
	const snapshot = await db.query.snapshots.findFirst({
		where: eq(snapshots.slug, params.slug)
	});

	if (!snapshot) {
		logError('editSnapshotNotes', 'Snapshot not found', { slug: params.slug });
		throw error(404, 'Snapshot not found');
	}

	// Validate user owns this snapshot
	try {
		validateUserAccess(snapshot, locals.user, 'Snapshot');
	} catch (err) {
		logError('editSnapshotNotes', 'Access denied', {
			userId: locals.user.id,
			snapshotUserId: snapshot.userId
		});
		throw error(403, 'You do not have permission to edit this snapshot');
	}

	devLog('editSnapshotNotes', 'Snapshot loaded for editing', {
		slug: params.slug,
		userId: locals.user.id
	});

	return {
		user: locals.user,
		snapshot
	};
};

export const actions: Actions = {
	updateNotes: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError('updateNotes', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		logFormData('updateNotes', request);

		// Fetch snapshot to validate ownership
		const snapshot = await db.query.snapshots.findFirst({
			where: eq(snapshots.slug, params.slug)
		});

		if (!snapshot) {
			logError('updateNotes', 'Snapshot not found', { slug: params.slug });
			return fail(404, { error: 'Snapshot not found' });
		}

		// Validate user owns this snapshot
		try {
			validateUserAccess(snapshot, locals.user, 'Snapshot');
		} catch (err) {
			logError('updateNotes', 'Access denied', {
				userId: locals.user.id,
				snapshotUserId: snapshot.userId
			});
			return fail(403, { error: 'You do not have permission to edit this snapshot' });
		}

		const formData = await request.formData();
		const notes = formData.get('notes') as string;

		// Only update notes field - financial data is immutable
		try {
			await db.update(snapshots)
				.set({ notes: notes || null })
				.where(eq(snapshots.slug, params.slug));

			devLog('updateNotes', 'Snapshot notes updated successfully', {
				slug: params.slug,
				userId: locals.user.id,
				hasNotes: !!notes
			});

			throw redirect(302, '/snapshots');
		} catch (err) {
			// Re-throw redirect (success case)
			if (err && typeof err === 'object' && 'status' in err && err.status === 302) {
				throw err;
			}

			// Handle other errors
			logError('updateNotes', 'Failed to update snapshot notes', err);
			return fail(500, { error: 'Failed to update notes. Please try again.' });
		}
	}
};
