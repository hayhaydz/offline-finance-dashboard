import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goalAllocations, goals } from "$lib/db/schema";
import { getCurrentBalancesForAccounts } from "$lib/server/derivedBalances";
import { devLog } from "$lib/server/logger";

// Re-export all pure calculations + types for backward compatibility
export {
	calculateLiquidityBreakdown,
	calculateContributionStats,
	calculatePaceMetrics,
	getDebtGoalProgress,
	projectPayoffDate,
	generateDefaultMilestones,
	checkMilestones,
	distributeWithdrawalAcrossAccounts,
} from "./goal-calculations";

export type {
	AccountAllocationWithLiquidity,
	AllocationHistoryEntry,
	ContributionStats,
	DebtGoalProgress,
	LiquidityBreakdown,
	MilestoneTemplate,
	MilestoneWithReached,
	PaceMetrics,
} from "./goal-calculations";

async function getOpenAssetAccountsWithLatestBalances(userId: number) {
	const userAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			eq(accounts.category, "asset"),
		),
	});
	const openAccounts = userAccounts.filter((account) => !account.closedAt);
	const balances = await getCurrentBalancesForAccounts(
		openAccounts.map((a) => a.id),
	);

	return openAccounts.map((account) => ({
		...account,
		balances: [{ balanceInCents: balances.get(account.id) ?? 0 }],
	}));
}

/**
 * Calculate Ready to Assign (unallocated assets)
 *
 * Ready to Assign = Total Assets - sum(savings goal.current_allocation)
 *
 * Also computes debt tracking breakdown:
 * - totalLiabilities: sum of abs(balance) for open liability accounts
 * - totalDebtTracked: sum of abs(startingBalance) for linked debt goals
 * - totalDebtUntracked: liabilities not yet tracked by any debt goal
 *
 * @param params - User ID and database instance
 * @returns Ready to assign amount and debt breakdown, all in cents
 */
export async function calculateReadyToAssign(params: {
	userId: number;
}): Promise<{
	readyToAssign: number;
	totalAssets: number;
	totalSavingsAllocated: number;
	totalDebtTracked: number;
	totalDebtUntracked: number;
	totalLiabilities: number;
}> {
	const { userId } = params;

	const openAccounts = await getOpenAssetAccountsWithLatestBalances(userId);

	// Calculate total assets
	const totalAssets = openAccounts.reduce((sum, account) => {
		return sum + (account.balances[0]?.balanceInCents || 0);
	}, 0);

	// Query all active goals for savings allocation calculation
	const userGoals = await db.query.goals.findMany({
		where: and(withUserFilter(userId, goals), isNull(goals.deletedAt)),
	});

	// Only savings goals (or null goalType treated as savings) count toward allocation
	const totalSavingsAllocated = userGoals.reduce(
		(sum, goal) =>
			goal.goalType === "debt" ? sum : sum + goal.currentAllocation,
		0,
	);

	// Ready to Assign = Total Assets - Savings Allocated
	const readyToAssign = totalAssets - totalSavingsAllocated;

	// --- Debt tracking breakdown ---

	// Get open liability accounts (category = 'liability', no closedAt)
	const liabilityAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			eq(accounts.category, "liability"),
			isNull(accounts.closedAt),
		),
	});

	const liabilityAccountIds = liabilityAccounts.map((a) => a.id);
	const liabilityBalances =
		liabilityAccountIds.length > 0
			? await getCurrentBalancesForAccounts(liabilityAccountIds)
			: new Map<number, number>();

	const totalLiabilities = liabilityAccounts.reduce(
		(sum, account) => sum + Math.abs(liabilityBalances.get(account.id) ?? 0),
		0,
	);

	// Sum abs(startingBalance) for debt goals that have a linked account
	const totalDebtTracked = userGoals.reduce(
		(sum, goal) =>
			goal.goalType === "debt" && goal.linkedAccountId !== null
				? sum + Math.abs(goal.startingBalanceInCents ?? 0)
				: sum,
		0,
	);

	const totalDebtUntracked = totalLiabilities - totalDebtTracked;

	devLog("readyToAssign", "Calculated Ready to Assign", {
		userId,
		totalAssets,
		totalSavingsAllocated,
		readyToAssign,
		totalLiabilities,
		totalDebtTracked,
		totalDebtUntracked,
	});

	return {
		readyToAssign,
		totalAssets,
		totalSavingsAllocated,
		totalDebtTracked,
		totalDebtUntracked,
		totalLiabilities,
	};
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
			sum: sql<number>`coalesce(sum(${goalAllocations.amount}), 0)`,
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
		const totalAllocatedFromAccount = Math.max(
			0,
			allocatedByAccountId.get(account.id) ?? 0,
		);
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

export async function getGoalAccountNetAllocations(params: {
	goalId: number;
}): Promise<Array<{ accountId: number; netAllocated: number }>> {
	const rows = await db
		.select({
			accountId: goalAllocations.accountId,
			netAllocated: sql<number>`coalesce(sum(${goalAllocations.amount}), 0)`,
		})
		.from(goalAllocations)
		.where(
			and(
				eq(goalAllocations.goalId, params.goalId),
				isNotNull(goalAllocations.accountId),
			),
		)
		.groupBy(goalAllocations.accountId);

	return rows
		.filter((row) => row.accountId !== null)
		.map((row) => ({
			accountId: row.accountId as number,
			netAllocated: row.netAllocated ?? 0,
		}))
		.filter((row) => row.netAllocated > 0);
}

/**
 * Get all allocations FROM a specific account, grouped by goal.
 * Used for auto-reducing allocations when account balance goes negative.
 */
export async function getAccountGoalAllocations(params: {
	accountId: number;
}): Promise<Array<{ goalId: number; netAllocated: number }>> {
	const rows = await db
		.select({
			goalId: goalAllocations.goalId,
			netAllocated: sql<number>`coalesce(sum(${goalAllocations.amount}), 0)`,
		})
		.from(goalAllocations)
		.where(eq(goalAllocations.accountId, params.accountId))
		.groupBy(goalAllocations.goalId);

	return rows
		.filter((row) => row.netAllocated > 0)
		.map((row) => ({
			goalId: row.goalId,
			netAllocated: row.netAllocated ?? 0,
		}));
}

/**
 * Reduce goal allocations proportionally when account balance goes negative.
 * Creates negative allocation records and updates goal currentAllocation.
 */
export async function reduceAllocationsForNegativeBalance(params: {
	accountId: number;
	newBalanceInCents: number;
}): Promise<
	Array<{ goalId: number; goalName: string; reductionAmount: number }>
> {
	const { accountId, newBalanceInCents } = params;

	// Get all allocations from this account
	const allocations = await getAccountGoalAllocations({ accountId });

	if (allocations.length === 0) {
		return [];
	}

	const totalAllocated = allocations.reduce(
		(sum, a) => sum + a.netAllocated,
		0,
	);

	// Calculate new max allocation (0 if balance is negative)
	const maxAllocatable = Math.max(0, newBalanceInCents);

	// If we have more allocated than the account can support
	if (totalAllocated <= maxAllocatable) {
		return []; // No reduction needed
	}

	const reductionNeeded = totalAllocated - maxAllocatable;

	devLog("reduceAllocations", "Reducing allocations due to negative balance", {
		accountId,
		newBalance: newBalanceInCents,
		totalAllocated,
		maxAllocatable,
		reductionNeeded,
		goalsAffected: allocations.length,
	});

	// Calculate proportional reductions
	const reductions: Array<{ goalId: number; reductionAmount: number }> = [];
	let assigned = 0;

	// Sort by allocation amount descending (reduce larger allocations first for cleaner cents distribution)
	const sortedAllocations = [...allocations].sort(
		(a, b) => b.netAllocated - a.netAllocated,
	);

	for (let i = 0; i < sortedAllocations.length; i++) {
		const allocation = sortedAllocations[i];
		const proportion = allocation.netAllocated / totalAllocated;
		let reduction = Math.round(proportion * reductionNeeded);

		// For the last item, assign remainder to ensure exact total
		if (i === sortedAllocations.length - 1) {
			reduction = reductionNeeded - assigned;
		}

		// Don't reduce more than the allocation
		reduction = Math.min(reduction, allocation.netAllocated);

		if (reduction > 0) {
			reductions.push({
				goalId: allocation.goalId,
				reductionAmount: reduction,
			});
			assigned += reduction;
		}
	}

	// Pre-fetch goal data needed for the transaction (names, current allocations)
	const goalIds = reductions.map((r) => r.goalId);
	const goalsData = await db
		.select({
			id: goals.id,
			name: goals.name,
			currentAllocation: goals.currentAllocation,
		})
		.from(goals)
		.where(inArray(goals.id, goalIds));

	const goalMap = new Map(goalsData.map((g) => [g.id, g]));

	const results: Array<{
		goalId: number;
		goalName: string;
		reductionAmount: number;
	}> = [];

	// Apply reductions in a sync transaction (better-sqlite3 requires sync callback)
	db.transaction((tx) => {
		for (const reduction of reductions) {
			const goal = goalMap.get(reduction.goalId);
			if (!goal) continue;

			// Create negative allocation record
			tx.insert(goalAllocations)
				.values({
					goalId: reduction.goalId,
					accountId,
					amount: -reduction.reductionAmount,
					type: "AUTO_REDUCE_NEGATIVE_BALANCE",
					allocationDate: new Date(),
					createdAt: new Date(),
				})
				.run();

			// Update goal's currentAllocation
			const newAllocation = Math.max(
				0,
				goal.currentAllocation - reduction.reductionAmount,
			);
			tx.update(goals)
				.set({ currentAllocation: newAllocation, updatedAt: new Date() })
				.where(eq(goals.id, reduction.goalId))
				.run();

			results.push({
				goalId: reduction.goalId,
				goalName: goal.name,
				reductionAmount: reduction.reductionAmount,
			});

			devLog("reduceAllocations", "Reduced goal allocation", {
				goalId: reduction.goalId,
				goalName: goal.name,
				reductionAmount: reduction.reductionAmount,
				newGoalAllocation: newAllocation,
			});
		}
	});

	return results;
}
