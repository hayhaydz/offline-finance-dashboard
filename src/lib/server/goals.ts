import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goalAllocations, goals } from "$lib/db/schema";
import { devLog } from "$lib/utils/logger";

async function getOpenAssetAccountsWithLatestBalances(userId: number) {
	const userAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			eq(accounts.category, "asset"),
		),
		with: {
			balances: {
				orderBy: (balances, { desc }) => desc(balances.asOfDate),
				limit: 1,
			},
		},
	});

	return userAccounts.filter((account) => !account.closedAt);
}

/**
 * Calculate Ready to Assign (unallocated assets)
 *
 * Ready to Assign = Total Assets - sum(all goal.current_allocation)
 *
 * @param params - User ID and database instance
 * @returns Unallocated amount in cents
 */
export async function calculateReadyToAssign(params: {
	userId: number;
}): Promise<{
	readyToAssign: number;
	totalAssets: number;
	totalAllocated: number;
}> {
	const { userId } = params;

	const openAccounts = await getOpenAssetAccountsWithLatestBalances(userId);

	// Calculate total assets
	const totalAssets = openAccounts.reduce((sum, account) => {
		return sum + (account.balances[0]?.balanceInCents || 0);
	}, 0);

	// Calculate total allocated (sum of all goal current_allocation)
	const userGoals = await db.query.goals.findMany({
		where: and(withUserFilter(userId, goals), isNull(goals.deletedAt)),
	});

	const totalAllocated = userGoals.reduce(
		(sum, goal) => sum + goal.currentAllocation,
		0,
	);

	// Ready to Assign = Total Assets - Total Allocated
	const readyToAssign = totalAssets - totalAllocated;

	devLog("readyToAssign", "Calculated Ready to Assign", {
		userId,
		totalAssets,
		totalAllocated,
		readyToAssign,
	});

	return { readyToAssign, totalAssets, totalAllocated };
}

/**
 * Calculate unallocated balance per account for Add Money account selection
 *
 * Per-account unallocated = account balance - sum(allocations from that account)
 *
 * @param params - User ID and database instance
 * @returns Array of accounts with unallocated amounts
 */
export async function calculatePerAccountUnallocated(params: {
	userId: number;
}): Promise<
	Array<
		Awaited<
			ReturnType<typeof getOpenAssetAccountsWithLatestBalances>
		>[number] & { unallocated: number }
	>
> {
	const { userId } = params;

	const openAccounts = await getOpenAssetAccountsWithLatestBalances(userId);
	const accountIds = openAccounts.map((account) => account.id);

	if (accountIds.length === 0) {
		return [];
	}

	// Sum all allocations for all accounts in one query (avoids N+1 round trips)
	const allocationSums = await db
		.select({
			accountId: goalAllocations.accountId,
			sum: sql<number>`coalesce(sum(abs(${goalAllocations.amount})), 0)`,
		})
		.from(goalAllocations)
		.where(inArray(goalAllocations.accountId, accountIds))
		.groupBy(goalAllocations.accountId);

	const allocatedByAccountId = new Map<number, number>();
	for (const row of allocationSums) {
		if (row.accountId !== null) {
			allocatedByAccountId.set(row.accountId, row.sum ?? 0);
		}
	}

	const accountsWithUnallocated = openAccounts.map((account) => {
		const accountBalance = account.balances[0]?.balanceInCents || 0;
		const totalAllocatedFromAccount = allocatedByAccountId.get(account.id) ?? 0;
		const unallocated = Math.max(0, accountBalance - totalAllocatedFromAccount);

		devLog("perAccountUnallocated", "Calculated for account", {
			accountId: account.id,
			accountName: account.name,
			accountBalance,
			totalAllocatedFromAccount,
			unallocated,
		});

		return {
			...account,
			unallocated,
		};
	});

	return accountsWithUnallocated.filter((a) => a.unallocated > 0);
}
