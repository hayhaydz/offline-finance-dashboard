import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { accounts } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const accountId = parseInt(params.id);

	// Get account and validate ownership
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.id, accountId)
	});

	if (!account) {
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	return {
		account
	};
};

export const actions: Actions = {
	/**
	 * Close an account (soft-delete)
	 * - Sets closedAt timestamp instead of hard-deleting
	 * - Preserves all balance history
	 * - Account remains in database but marked as closed
	 */
	closeAccount: async ({ locals, params }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const accountId = parseInt(params.id);

		// Validate ownership
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, accountId)
		});

		if (!account) {
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		// Soft-delete by setting closedAt timestamp
		await db
			.update(accounts)
			.set({
				closedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(accounts.id, accountId));

		// Redirect to accounts list
		redirect(303, '/accounts');
	}
};
