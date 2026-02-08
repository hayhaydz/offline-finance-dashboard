import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { parseCurrency } from '$lib/utils/currency';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const accountSlug = params.slug;
	const balanceSlug = params.balanceSlug;

	// Validate account ownership using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug)
	});

	if (!account) {
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	// Get balance entry and verify it belongs to this account using slug
	const balance = await db.query.accountBalances.findFirst({
		where: eq(accountBalances.slug, balanceSlug)
	});

	if (!balance || balance.accountId !== account.id) {
		error(404, 'Balance entry not found');
	}

	// Format date for input value (YYYY-MM-DD)
	const asOfDateStr = balance.asOfDate.toISOString().split('T')[0];

	return {
		account,
		balance,
		asOfDateStr
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
			return fail(401, { error: 'Authentication required' });
		}

		const accountSlug = params.slug;
		const balanceSlug = params.balanceSlug;

		// Validate ownership using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug)
		});

		if (!account) {
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		// Verify balance belongs to this account using slug
		const existingBalance = await db.query.accountBalances.findFirst({
			where: eq(accountBalances.slug, balanceSlug)
		});

		if (!existingBalance || existingBalance.accountId !== account.id) {
			return fail(404, { error: 'Balance entry not found' });
		}

		const formData = await request.formData();
		const balanceStr = formData.get('balance') as string;
		const asOfDateStr = formData.get('asOfDate') as string;
		const notes = formData.get('notes') as string | null;

		// Validate balance
		let balanceInCents: number;
		try {
			balanceInCents = parseCurrency(balanceStr);
		} catch (err) {
			return fail(400, { error: 'Invalid balance format. Enter amount like 123.45 or 123' });
		}

		// Parse date (midnight UTC to avoid timezone issues)
		const asOfDate = new Date(asOfDateStr + 'T00:00:00.000Z');

		// Check for future date (block it)
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		if (asOfDate > today) {
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

		redirect(303, `/accounts/${account.slug}`);
	}
};
