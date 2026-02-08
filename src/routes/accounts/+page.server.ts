import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db/client';
import { accounts, accountBalances } from '$lib/db/schema';
import { withUserFilter, validateUserAccess } from '$lib/auth/row-security';
import { parseCurrency } from '$lib/utils/currency';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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
		institution: account.institution,
		liquidity: account.liquidity,
		closedAt: account.closedAt,
		excludedFromNetWorth: account.excludedFromNetWorth,
		createdAt: account.createdAt,
		updatedAt: account.updatedAt,
		currentBalance: account.balances[0]?.balanceInCents || null,
		lastUpdated: account.balances[0]?.asOfDate || null
	}));

	return {
		accounts: accountsWithBalances,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Authentication required' });
		}

		const formData = await request.formData();
		const accountIdStr = formData.get('accountId') as string;
		const balanceStr = formData.get('balance') as string;
		const notes = formData.get('notes') as string;

		// Validate account ID
		const accountId = parseInt(accountIdStr);
		if (isNaN(accountId)) {
			return fail(400, { error: 'Invalid account selected' });
		}

		// Validate user owns the account
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, accountId)
		});

		if (!account) {
			return fail(404, { error: 'Account not found' });
		}

		validateUserAccess(account, locals.user, 'Account');

		// Parse balance to cents
		let balanceInCents: number;
		try {
			balanceInCents = parseCurrency(balanceStr);
		} catch (e) {
			return fail(400, { error: 'Invalid balance format. Enter amount like 123.45 or 123' });
		}

		// Set asOfDate to today (UTC timestamp) - quick-add always uses today
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		// Check for existing entry for same account and today's date
		const existing = await db.query.accountBalances.findFirst({
			where: and(
				eq(accountBalances.accountId, accountId),
				eq(accountBalances.asOfDate, today)
			)
		});

		if (existing) {
			return fail(409, {
				error: `A balance entry already exists for today (${today.toISOString().split('T')[0]}). [Edit the existing entry](/accounts/${account.slug}/balances/${existing.slug}/edit) or choose a different date.`,
				existingBalanceId: existing.id,
				existingBalance: existing.balanceInCents,
				proposedBalance: balanceInCents
			});
		}

		// Insert new balance entry with slug
		const balanceSlug = nanoid(16);
		await db.insert(accountBalances).values({
			accountId,
			slug: balanceSlug,
			balanceInCents,
			asOfDate: today,
			notes: notes || null
		});

		// Redirect back to accounts list
		redirect(303, '/accounts');
	}
};
