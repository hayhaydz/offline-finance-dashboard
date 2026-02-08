import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { parseCurrency } from '$lib/utils/currency';
import { eq, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const accountId = parseInt(params.id);
	const offsetParam = url.searchParams.get('offset');
	const offset = offsetParam ? parseInt(offsetParam) : 0;

	// Get account with ownership validation
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.id, accountId)
	});

	if (!account) {
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	// Get balance history (50 entries, newest first)
	const balances = await db.query.accountBalances.findMany({
		where: eq(accountBalances.accountId, accountId),
		orderBy: desc(accountBalances.asOfDate),
		limit: 50,
		offset
	});

	// Calculate "change from previous" for display
	const balancesWithChange = balances.map((balance, index) => {
		const previous = balances[index + 1]; // Next item is chronologically older
		return {
			...balance,
			changeFromPrevious: previous ? balance.balanceInCents - previous.balanceInCents : null
		};
	});

	// Get current balance (most recent entry)
	const currentBalance = balances.length > 0 ? balances[0].balanceInCents : 0;

	return {
		account,
		balances: balancesWithChange,
		currentBalance,
		hasMore: balances.length === 50 // If we got 50, there might be more
	};
};

export const actions: Actions = {
	/**
	 * Add a new balance entry to an account
	 * - Validates user owns the account
	 * - Parses balance to cents
	 * - Blocks future dates
	 * - Checks for existing entry on same date (returns 409 conflict)
	 */
	addBalance: async ({ request, locals, params }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const accountId = parseInt(params.id);

		// Validate ownership first
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, accountId)
		});

		if (!account) {
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		const formData = await request.formData();
		const balanceStr = formData.get('balance') as string;
		const asOfDateStr = formData.get('asOfDate') as string; // YYYY-MM-DD format
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

		// Check if entry exists for this date
		const existing = await db.query.accountBalances.findFirst({
			where: and(
				eq(accountBalances.accountId, accountId),
				eq(accountBalances.asOfDate, asOfDate)
			)
		});

		if (existing) {
			// Return warning to user - they'll confirm via a separate "replace" action
			return fail(409, {
				error: `A balance entry already exists for ${asOfDateStr}. Click "Replace" to overwrite it.`,
				existingBalanceId: existing.id,
				existingBalance: existing.balanceInCents,
				proposedBalance: balanceInCents
			});
		}

		// Insert new balance entry
		await db.insert(accountBalances).values({
			accountId,
			balanceInCents,
			asOfDate,
			notes: notes?.trim() || null
		});

		// Update account's updatedAt timestamp
		await db
			.update(accounts)
			.set({ updatedAt: new Date() })
			.where(eq(accounts.id, accountId));

		redirect(303, `/accounts/${accountId}`);
	},

	/**
	 * Delete a balance entry (fully editable per BALN-02)
	 * - Validates user owns the account
	 * - Verifies balance belongs to this account
	 * - Deletes the entry
	 */
	deleteBalance: async ({ request, locals, params }) => {
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

		const formData = await request.formData();
		const balanceId = formData.get('balanceId') as string;

		if (!balanceId) {
			return fail(400, { error: 'Balance ID is required' });
		}

		// Verify balance belongs to this account
		const balance = await db.query.accountBalances.findFirst({
			where: eq(accountBalances.id, parseInt(balanceId))
		});

		if (!balance || balance.accountId !== accountId) {
			return fail(404, { error: 'Balance entry not found' });
		}

		// Delete the balance entry
		await db.delete(accountBalances).where(eq(accountBalances.id, parseInt(balanceId)));

		// Update account's updatedAt timestamp
		await db
			.update(accounts)
			.set({ updatedAt: new Date() })
			.where(eq(accounts.id, accountId));

		redirect(303, `/accounts/${accountId}`);
	}
};
