import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { accounts } from '$lib/db/schema';
import { withUserFilter, validateUserAccess } from '$lib/auth/row-security';
import { addBalanceEntry } from '$lib/utils/balances';
import { devLog, logError, logFormData } from '$lib/utils/logger';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// Query accounts with user filter and latest balances
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		with: {
			balances: {
				orderBy: (balances, { desc }) => desc(balances.asOfDate),
				limit: 1
			}
		},
		orderBy: (accounts, { desc }) => desc(accounts.createdAt)
	});

	// Transform data for display
	const accountsWithBalances = userAccounts.map((account) => ({
		id: account.id,
		slug: account.slug,
		name: account.name,
		type: account.type,
		category: account.category,
		taxWrapper: account.taxWrapper,
		institution: account.institution,
		liquidity: account.liquidity,
		closedAt: account.closedAt,
		excludedFromNetWorth: account.excludedFromNetWorth,
		createdAt: account.createdAt,
		updatedAt: account.updatedAt,
		currentBalance: account.balances[0]?.balanceInCents || null,
		lastUpdated: account.balances[0]?.asOfDate || null
	}));

	// Get unique institutions for filtering
	const institutions = Array.from(new Set(userAccounts.map(a => a.institution).filter(Boolean))) as string[];

	return {
		accounts: accountsWithBalances,
		institutions,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		}
	};
};

export const actions: Actions = {
	quickAdd: async ({ request, locals }) => {
		if (!locals.user) {
			logError('quickAddBalance', 'Authentication required');
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		logFormData('quickAddBalance', Object.fromEntries(formData));
		const accountIdStr = formData.get('accountId') as string;
		const balanceStr = formData.get('balance') as string;
		const notes = formData.get('notes') as string;

		// Validate account ID
		const accountId = parseInt(accountIdStr);
		if (isNaN(accountId)) {
			devLog('quickAddBalance', 'Validation failed - invalid account ID', { accountIdStr });
			return fail(400, { error: 'Invalid account selected' });
		}

		// Validate user owns the account
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, accountId)
		});

		if (!account) {
			logError('quickAddBalance', 'Account not found', { accountId, userId: locals.user.id });
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		// Set asOfDate to today (UTC timestamp) - quick-add always uses today
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		today.setUTCMilliseconds(0);

		// Use shared balance entry function
		const result = await addBalanceEntry(
			{ accountId, balanceStr, asOfDate: today, notes },
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

		return { success: result.success };
	}
};
