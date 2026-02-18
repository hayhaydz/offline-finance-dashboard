import { and, eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '$lib/db/client';
import { goals, accounts, goalAllocations } from '$lib/db/schema';
import { withUserFilter } from '$lib/auth/row-security';
import { devLog } from '$lib/utils/logger';
import type { Account } from '$lib/db/schema';

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

	// Fetch user's asset accounts with latest balances
	const userAccounts = await db.query.accounts.findMany({
		where: and(withUserFilter(userId, accounts), eq(accounts.category, 'asset')),
		with: {
			balances: {
				orderBy: (balances, { desc }) => desc(balances.asOfDate),
				limit: 1
			}
		}
	});

	// Filter to open asset accounts
	const openAccounts = userAccounts.filter((a) => !a.closedAt);

	// Calculate total assets
	const totalAssets = openAccounts.reduce((sum, account) => {
		return sum + (account.balances[0]?.balanceInCents || 0);
	}, 0);

	// Calculate total allocated (sum of all goal current_allocation)
	const userGoals = await db.query.goals.findMany({
		where: and(withUserFilter(userId, goals), isNull(goals.deletedAt))
	});

	const totalAllocated = userGoals.reduce((sum, goal) => sum + goal.currentAllocation, 0);

	// Ready to Assign = Total Assets - Total Allocated
	const readyToAssign = totalAssets - totalAllocated;

	devLog('readyToAssign', 'Calculated Ready to Assign', {
		userId,
		totalAssets,
		totalAllocated,
		readyToAssign
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
}): Promise<Array<Account & { unallocated: number }>> {
	const { userId } = params;

	// Fetch user's asset accounts with latest balances
	const userAccounts = await db.query.accounts.findMany({
		where: and(withUserFilter(userId, accounts), eq(accounts.category, 'asset')),
		with: {
			balances: {
				orderBy: (balances, { desc }) => desc(balances.asOfDate),
				limit: 1
			}
		}
	});

	// Filter to open accounts and calculate unallocated per account
	const accountsWithUnallocated = await Promise.all(
		userAccounts
			.filter((account) => !account.closedAt)
			.map(async (account) => {
				const accountBalance = account.balances[0]?.balanceInCents || 0;

				// Sum all allocations from this account (absolute values since ledger has signed amounts)
				const allocations = await db
					.select({ sum: sql<number>`sum(abs(${goalAllocations.amount}))` })
					.from(goalAllocations)
					.where(eq(goalAllocations.accountId, account.id));

				const totalAllocatedFromAccount = allocations[0]?.sum || 0;
				const unallocated = Math.max(0, accountBalance - totalAllocatedFromAccount);

				devLog('perAccountUnallocated', 'Calculated for account', {
					accountId: account.id,
					accountName: account.name,
					accountBalance,
					totalAllocatedFromAccount,
					unallocated
				});

				return {
					...account,
					unallocated
				};
			})
	);

	return accountsWithUnallocated.filter((a) => a.unallocated > 0);
}
