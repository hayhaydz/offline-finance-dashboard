import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq } from 'drizzle-orm';

// Valid account types
const VALID_ACCOUNT_TYPES = ['current', 'savings', 'credit', 'investment', 'ISA', 'LISA'];

// Valid liquidity values
const VALID_LIQUIDITY_VALUES = ['instant', 'delayed', 'locked'];

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const accountSlug = params.slug;
	devLog('editAccount', 'Loading account for edit', { accountSlug });

	// Get account and validate ownership using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug)
	});

	if (!account) {
		logError('editAccount', 'Account not found', { accountSlug });
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	return {
		account,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false }, // Replace account slug with account name
			{ segmentIndex: 2, label: `Edit Account`, skipLink: false }
		]
	};
};

export const actions: Actions = {
	/**
	 * Update an existing account
	 * - Validates ownership
	 * - Server-side validation of form data
	 * - Updates account with new values
	 */
	updateAccount: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError('editAccount', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const accountSlug = params.slug;

		// Validate ownership using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug)
		});

		if (!account) {
			logError('editAccount', 'Account not found', { accountSlug });
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		const formData = await request.formData();
		logFormData('editAccount', Object.fromEntries(formData));
		const name = formData.get('name') as string;
		const type = formData.get('type') as string;
		const institution = formData.get('institution') as string | null;
		const liquidity = formData.get('liquidity') as string;

		// Validation
		if (!name?.trim()) {
			devLog('editAccount', 'Validation failed - name required', { accountSlug });
			return fail(400, { error: 'Account name is required' });
		}

		if (!VALID_ACCOUNT_TYPES.includes(type)) {
			devLog('editAccount', 'Validation failed - invalid type', { accountSlug, type });
			return fail(400, { error: 'Invalid account type' });
		}

		if (!VALID_LIQUIDITY_VALUES.includes(liquidity)) {
			devLog('editAccount', 'Validation failed - invalid liquidity', { accountSlug, liquidity });
			return fail(400, { error: 'Invalid liquidity value' });
		}

		devLog('editAccount', 'Form validation passed', {
			accountSlug,
			name: name.trim(),
			type,
			institution: institution?.trim() || null,
			liquidity
		});

		// Update account
		await db
			.update(accounts)
			.set({
				name: name.trim(),
				type,
				institution: institution?.trim() || null,
				liquidity,
				updatedAt: new Date()
			})
			.where(eq(accounts.id, account.id));

		devLog('editAccount', 'Account updated successfully', {
			accountId: account.id,
			accountSlug
		});

		devLog('editAccount', 'Redirecting to account detail', { accountSlug });
		redirect(303, `/accounts/${account.slug}`);
	}
};
