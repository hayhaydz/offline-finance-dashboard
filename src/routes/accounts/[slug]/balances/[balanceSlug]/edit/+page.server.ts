import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { parseCurrency } from '$lib/utils/currency';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const accountSlug = params.slug;
	const balanceSlug = params.balanceSlug;

	devLog('editBalance', 'Loading edit balance page', { accountSlug, balanceSlug });

	// Validate account ownership using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug)
	});

	if (!account) {
		logError('editBalance', 'Account not found', { accountSlug, userId: locals.user.id });
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	if (account.closedAt) {
		logError('editBalance', 'Attempt to edit balance on closed account', { accountSlug });
		redirect(303, `/accounts/${account.slug}`);
	}

	// Get balance entry and verify it belongs to this account using slug
	const balance = await db.query.accountBalances.findFirst({
		where: eq(accountBalances.slug, balanceSlug)
	});

	if (!balance || balance.accountId !== account.id) {
		logError('editBalance', 'Balance entry not found', {
			balanceSlug,
			accountId: account.id,
			userId: locals.user.id
		});
		error(404, 'Balance entry not found');
	}

	devLog('editBalance', 'Balance loaded for editing', {
		balanceSlug,
		accountId: account.id,
		balanceInCents: balance.balanceInCents,
		asOfDate: balance.asOfDate
	});

	// Format date for input value (YYYY-MM-DD)
	const asOfDateStr = balance.asOfDate.toISOString().split('T')[0];

	return {
		account,
		balance,
		asOfDateStr,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false }, // Replace account slug with account name
			{ segmentIndex: 2, label: `Balances`, skipLink: true }, // Not a link - no balances list page
			{ segmentIndex: 3, label: asOfDateStr, skipLink: true }, // Balance slug with date, not a link
			{ segmentIndex: 4, label: `Edit Balance`, skipLink: false }
		]
	};
};

export const actions: Actions = {
	/**
	 * Update an existing balance entry
	 * - Validates user owns the account
	 * - Parses balance to cents
	 * - Blocks future dates
	 * - Checks for conflicts with other entries on same date
	 * - Updates the entry
	 */
	updateBalanceEntry: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError('editBalance', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const accountSlug = params.slug;
		const balanceSlug = params.balanceSlug;

		// Validate ownership using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug)
		});

		if (!account) {
			logError('editBalance', 'Account not found', { accountSlug, userId: locals.user.id });
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		if (account.closedAt) {
			logError('editBalance', 'Attempt to edit balance on closed account', { accountSlug });
			return fail(403, { error: 'Cannot edit balance of a closed account.' });
		}

		// Verify balance belongs to this account using slug
		const existingBalance = await db.query.accountBalances.findFirst({
			where: eq(accountBalances.slug, balanceSlug)
		});

		if (!existingBalance || existingBalance.accountId !== account.id) {
			logError('editBalance', 'Balance entry not found', {
				balanceSlug,
				accountId: account.id,
				userId: locals.user.id
			});
			return fail(404, { error: 'Balance entry not found' });
		}

		const formData = await request.formData();
		logFormData('editBalance', Object.fromEntries(formData));
		const balanceStr = formData.get('balance') as string;
		const asOfDateStr = formData.get('asOfDate') as string;
		const notes = formData.get('notes') as string | null;

		// Validate balance
		let balanceInCents: number;
		try {
			balanceInCents = parseCurrency(balanceStr);
		} catch (err) {
			devLog('editBalance', 'parseCurrency validation failed', {
				input: balanceStr,
				accountSlug: params.slug,
				balanceSlug: params.balanceSlug,
				error: err instanceof Error ? err.message : String(err)
			});
			return fail(400, { error: 'Invalid balance format. Enter amount like 123.45 or 123' });
		}

		devLog('editBalance', 'Validation passed', {
			balanceInCents,
			asOfDate: asOfDateStr,
			notes: notes?.trim() || null
		});

		// Parse date (midnight UTC to avoid timezone issues)
		const asOfDate = new Date(asOfDateStr + 'T00:00:00.000Z');

		// Check for future date (block it)
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		if (asOfDate > today) {
			devLog('editBalance', 'Future date blocked', { asOfDate: asOfDateStr });
			return fail(400, { error: 'Cannot enter balances for future dates' });
		}

		// Check for conflicts with other entries on same date (excluding current balanceSlug)
		const conflict = await db.query.accountBalances.findFirst({
			where: and(
				eq(accountBalances.accountId, account.id),
				eq(accountBalances.asOfDate, asOfDate)
			)
		});

		if (conflict && conflict.slug !== balanceSlug) {
			devLog('editBalance', 'Conflict detected', {
				asOfDate: asOfDateStr,
				conflictingSlug: conflict.slug,
				currentSlug: balanceSlug
			});
			return fail(409, {
				error: `A balance entry already exists for ${asOfDateStr}. Choose a different date or edit that entry instead.`
			});
		}

		// Update the balance entry
		await db
			.update(accountBalances)
			.set({
				balanceInCents,
				asOfDate,
				notes: notes?.trim() || null,
				updatedAt: new Date()
			})
			.where(eq(accountBalances.id, existingBalance.id));

		// Update account's updatedAt timestamp
		await db
			.update(accounts)
			.set({ updatedAt: new Date() })
			.where(eq(accounts.id, account.id));

		devLog('editBalance', 'Balance updated successfully', {
			balanceSlug,
			accountId: account.id,
			balanceInCents,
			asOfDate: asOfDateStr
		});

		redirect(303, `/accounts/${account.slug}`);
	}
};
