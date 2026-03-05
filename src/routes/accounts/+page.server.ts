import { redirect } from "@sveltejs/kit";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	// Query accounts with user filter
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		orderBy: (accounts, { desc }) => desc(accounts.createdAt),
	});
	const accountIds = userAccounts.map((a) => a.id);
	const [currentBalances, latestTransactionDates] = await Promise.all([
		getCurrentBalancesForAccounts(accountIds),
		getLatestTransactionDateForAccounts(accountIds),
	]);

	// Transform data for display
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const millisecondsPerDay = 24 * 60 * 60 * 1000;

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
		maturityDate: account.maturityDate,
		createdAt: account.createdAt,
		updatedAt: account.updatedAt,
		currentBalance: currentBalances.get(account.id) ?? 0,
		lastUpdated: latestTransactionDates.get(account.id) ?? null,
		daysToMaturity: account.maturityDate
			? Math.ceil((account.maturityDate.getTime() - today.getTime()) / millisecondsPerDay)
			: null,
	}));

	// Get unique institutions for filtering
	const institutions = Array.from(
		new Set(userAccounts.map((a) => a.institution).filter(Boolean)),
	) as string[];

	return {
		accounts: accountsWithBalances,
		institutions,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
	};
};
