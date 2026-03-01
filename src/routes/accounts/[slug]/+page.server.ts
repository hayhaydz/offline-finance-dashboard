import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { validateUserAccess } from '$lib/auth/row-security';
import { addBalanceEntry } from '$lib/utils/balances';
import { devLog, logError } from '$lib/utils/logger';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const accountSlug = params.slug;
	const offsetParam = url.searchParams.get('offset');
	const offset = offsetParam ? parseInt(offsetParam) : 0;

	// Get account with ownership validation using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug)
	});

	if (!account) {
		logError('accountDetail', 'Account not found', { accountSlug, userId: locals.user.id });
		error(404, 'Account not found');
	}

	validateUserAccess(account, locals.user, 'Account');

	// Get balance history (50 entries, newest first) using account.id
	const balances = await db.query.accountBalances.findMany({
		where: eq(accountBalances.accountId, account.id),
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
		hasMore: balances.length === 50, // If we got 50, there might be more
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false } // Replace account slug (segment 1) with account name
		]
	};
};

export const actions: Actions = {
	/**
	 * Add a new balance entry to an account
	 */
	addBalance: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError('addBalance', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const accountSlug = params.slug;

		// Validate ownership first using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug)
		});

		if (!account) {
			logError('addBalance', 'Account not found', { accountSlug, userId: locals.user.id });
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		const formData = await request.formData();
		const balanceStr = formData.get('balance') as string;
		const asOfDateStr = formData.get('asOfDate') as string; // YYYY-MM-DD format
		const notes = formData.get('notes') as string | null;

		// Parse date (midnight UTC to avoid timezone issues)
		const asOfDate = new Date(asOfDateStr + 'T00:00:00.000Z');

		// Check for future date (block it)
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		today.setUTCMilliseconds(0);
		if (asOfDate > today) {
			devLog('addBalance', 'Future date blocked', { asOfDate: asOfDateStr, accountSlug });
			return fail(400, { error: 'Cannot enter balances for future dates' });
		}

		// Use shared balance entry function
		const result = await addBalanceEntry(
			{ accountId: account.id, balanceStr, asOfDate, notes },
			account
		);

		if (result.type === 'conflict') {
			return fail(409, {
				error: result.error,
				existingBalanceId: result.existingBalanceId,
				existingBalance: result.existingBalance,
				proposedBalance: result.proposedBalance
			});
		}

		devLog('addBalance', 'Balance entry created successfully', {
			accountSlug,
			balanceSlug: result.balanceSlug,
			balanceInCents: result.balanceInCents
		});
		return { success: result.success };
	}
};
