import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goalAllocations, goals } from "$lib/db/schema";
import { getCurrentBalancesForAccounts } from "$lib/server/derivedBalances";
import { devLog } from "$lib/utils/logger";

// Type for account allocation with liquidity info
export interface AccountAllocationWithLiquidity {
	netAllocated: number;
	liquidity: string | null;
}

export interface LiquidityBreakdown {
	instantPercent: number;
	delayedPercent: number;
	lockedPercent: number;
	totalAllocatedInCents: number;
	hasLiquidityWarning: boolean;
	warningMessage: string | null;
}

// Days threshold for "urgent" goal (locked funds warning)
const URGENT_DAYS_THRESHOLD = 30;

/**
 * Calculate liquidity breakdown for goal allocations.
 * Warns if goal is urgent but funds are locked/delayed.
 */
export function calculateLiquidityBreakdown(
	accountAllocations: AccountAllocationWithLiquidity[],
	targetDate: Date | null = null,
): LiquidityBreakdown {
	const totalAllocatedInCents = accountAllocations.reduce(
		(sum, a) => sum + a.netAllocated,
		0,
	);

	if (totalAllocatedInCents === 0 || accountAllocations.length === 0) {
		return {
			instantPercent: 0,
			delayedPercent: 0,
			lockedPercent: 0,
			totalAllocatedInCents: 0,
			hasLiquidityWarning: false,
			warningMessage: null,
		};
	}

	// Sum by liquidity type (treat null as instant)
	let instantTotal = 0;
	let delayedTotal = 0;
	let lockedTotal = 0;

	for (const alloc of accountAllocations) {
		const liquidity = alloc.liquidity ?? "instant";
		if (liquidity === "instant") {
			instantTotal += alloc.netAllocated;
		} else if (liquidity === "delayed") {
			delayedTotal += alloc.netAllocated;
		} else if (liquidity === "locked") {
			lockedTotal += alloc.netAllocated;
		}
	}

	const instantPercent = Math.round(
		(instantTotal / totalAllocatedInCents) * 100,
	);
	const delayedPercent = Math.round(
		(delayedTotal / totalAllocatedInCents) * 100,
	);
	const lockedPercent = Math.round((lockedTotal / totalAllocatedInCents) * 100);

	// Check for liquidity warning
	let hasLiquidityWarning = false;
	let warningMessage: string | null = null;

	if (targetDate) {
		const now = new Date();
		const daysUntilTarget = Math.ceil(
			(new Date(targetDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (daysUntilTarget <= URGENT_DAYS_THRESHOLD && daysUntilTarget > 0) {
			if (lockedPercent > 0) {
				hasLiquidityWarning = true;
				warningMessage = `${lockedPercent}% of funds are locked but target date is only ${daysUntilTarget} days away`;
			} else if (delayedPercent > 50) {
				hasLiquidityWarning = true;
				warningMessage = `${delayedPercent}% of funds have delayed access - may not be available by target date`;
			}
		}
	}

	return {
		instantPercent,
		delayedPercent,
		lockedPercent,
		totalAllocatedInCents,
		hasLiquidityWarning,
		warningMessage,
	};
}

// Type for pace metrics result
export interface PaceMetrics {
	daysRemaining: number | null;
	amountRemainingInCents: number;
	requiredMonthlyInCents: number | null;
	actualMonthlyAvgInCents: number;
	projectedCompletionDate: Date | null;
	onTrack: boolean | null; // true if projected <= target
}

// Type for allocation history entry (minimal for calculations)
export interface AllocationHistoryEntry {
	amount: number;
	createdAt: Date;
	type: string;
}

export interface ContributionStats {
	daysSinceLastContribution: number | null;
	totalContributions: number;
	totalWithdrawals: number;
	netContributedInCents: number;
	firstContributionDate: Date | null;
	lastContributionDate: Date | null;
}

/**
 * Calculate contribution statistics from allocation history.
 */
export function calculateContributionStats(
	allocationHistory: AllocationHistoryEntry[],
): ContributionStats {
	if (allocationHistory.length === 0) {
		return {
			daysSinceLastContribution: null,
			totalContributions: 0,
			totalWithdrawals: 0,
			netContributedInCents: 0,
			firstContributionDate: null,
			lastContributionDate: null,
		};
	}

	// Sort by date ascending
	const sorted = [...allocationHistory].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);

	let totalContributions = 0;
	let totalWithdrawals = 0;
	let netContributedInCents = 0;
	let firstContributionDate: Date | null = null;
	let lastContributionDate: Date | null = null;

	for (const entry of sorted) {
		if (entry.type === "USER_ADD" && entry.amount > 0) {
			totalContributions++;
			netContributedInCents += entry.amount;

			if (!firstContributionDate) {
				firstContributionDate = entry.createdAt;
			}
			lastContributionDate = entry.createdAt;
		} else if (
			entry.type === "USER_WITHDRAW" ||
			entry.type === "AUTO_REDUCE_NEGATIVE_BALANCE" ||
			entry.amount < 0
		) {
			totalWithdrawals++;
			netContributedInCents += entry.amount; // amount is already negative
		}
	}

	// Calculate days since last contribution
	let daysSinceLastContribution: number | null = null;
	if (lastContributionDate) {
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const last = new Date(lastContributionDate);
		last.setHours(0, 0, 0, 0);
		daysSinceLastContribution = Math.floor(
			(now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
		);
	}

	return {
		daysSinceLastContribution,
		totalContributions,
		totalWithdrawals,
		netContributedInCents,
		firstContributionDate,
		lastContributionDate,
	};
}

/**
 * Calculate pace metrics for a goal.
 * Determines if the user is on track to meet their target date.
 */
export function calculatePaceMetrics(params: {
	targetAmountInCents: number;
	currentAllocationInCents: number;
	targetDate: Date | null;
	firstContributionDate?: Date | null;
}): PaceMetrics {
	const {
		targetAmountInCents,
		currentAllocationInCents,
		targetDate,
		firstContributionDate,
	} = params;

	const amountRemainingInCents = Math.max(
		0,
		targetAmountInCents - currentAllocationInCents,
	);

	// Calculate days remaining
	let daysRemaining: number | null = null;
	let requiredMonthlyInCents: number | null = null;

	if (targetDate) {
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const target = new Date(targetDate);
		target.setHours(0, 0, 0, 0);

		const diffMs = target.getTime() - now.getTime();
		daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

		// Required monthly = remaining / months remaining
		if (daysRemaining > 0) {
			const monthsRemaining = daysRemaining / 30;
			requiredMonthlyInCents = Math.ceil(
				amountRemainingInCents / monthsRemaining,
			);
		} else {
			requiredMonthlyInCents = amountRemainingInCents; // Already past due
		}
	}

	// Calculate actual monthly average
	let actualMonthlyAvgInCents = 0;
	let projectedCompletionDate: Date | null = null;

	if (firstContributionDate && currentAllocationInCents > 0) {
		const now = new Date();
		const first = new Date(firstContributionDate);
		const monthsSinceFirst = Math.max(
			1,
			(now.getTime() - first.getTime()) / (30 * 24 * 60 * 60 * 1000),
		);
		actualMonthlyAvgInCents = Math.round(
			currentAllocationInCents / monthsSinceFirst,
		);

		// Project completion date
		if (actualMonthlyAvgInCents > 0 && amountRemainingInCents > 0) {
			const monthsUntilComplete =
				amountRemainingInCents / actualMonthlyAvgInCents;
			projectedCompletionDate = new Date(
				now.getTime() + monthsUntilComplete * 30 * 24 * 60 * 60 * 1000,
			);
		} else if (amountRemainingInCents === 0) {
			projectedCompletionDate = now; // Already complete
		}
	}

	// Determine if on track
	let onTrack: boolean | null = null;
	if (targetDate && projectedCompletionDate) {
		onTrack = projectedCompletionDate <= targetDate;
	}

	return {
		daysRemaining,
		amountRemainingInCents,
		requiredMonthlyInCents,
		actualMonthlyAvgInCents,
		projectedCompletionDate,
		onTrack,
	};
}

export interface DebtGoalProgress {
	paidInCents: number;
	totalInCents: number;
	percent: number;
	remainingInCents: number;
	debtGrewBeyondStarting: boolean;
}

export function getDebtGoalProgress(params: {
	startingBalanceInCents: number;
	currentBalanceInCents: number;
}): DebtGoalProgress {
	const { startingBalanceInCents, currentBalanceInCents } = params;

	const totalInCents = Math.abs(startingBalanceInCents);
	const remainingInCents = Math.abs(currentBalanceInCents);
	const rawPaidInCents = totalInCents - remainingInCents;
	const paidInCents = Math.max(0, rawPaidInCents);
	const debtGrewBeyondStarting = remainingInCents > totalInCents;
	const rawPercent = totalInCents > 0 ? (paidInCents / totalInCents) * 100 : 100;
	const percent = Math.max(0, Math.min(100, rawPercent));

	return { paidInCents, totalInCents, percent, remainingInCents, debtGrewBeyondStarting };
}

/**
 * Project payoff date based on historical payment pace.
 * Uses simple average monthly payment (no amortization/compounding).
 */
export function projectPayoffDate(params: {
	remainingInCents: number;
	totalPaidInCents: number;
	firstPaymentDate: Date | null;
}): Date | null {
	const { remainingInCents, totalPaidInCents, firstPaymentDate } = params;

	if (!firstPaymentDate || totalPaidInCents <= 0 || remainingInCents <= 0) {
		return null;
	}

	const now = new Date();
	const msPerMonth = 30 * 24 * 60 * 60 * 1000;
	const monthsSinceFirst = Math.max(
		1,
		(now.getTime() - firstPaymentDate.getTime()) / msPerMonth,
	);
	const avgMonthlyPayment = Math.round(totalPaidInCents / monthsSinceFirst);

	if (avgMonthlyPayment <= 0) return null;

	const monthsUntilPayoff = remainingInCents / avgMonthlyPayment;
	return new Date(now.getTime() + monthsUntilPayoff * msPerMonth);
}

export interface MilestoneTemplate {
	label: string;
	thresholdInCents: number;
}

export function generateDefaultMilestones(params: {
	startingBalanceInCents: number;
}): MilestoneTemplate[] {
	const { startingBalanceInCents } = params;
	const absStarting = Math.abs(startingBalanceInCents);

	return [
		{ label: "25% paid off", thresholdInCents: Math.round(absStarting * 0.75) },
		{ label: "Halfway there", thresholdInCents: Math.round(absStarting * 0.5) },
		{ label: "75% paid off", thresholdInCents: Math.round(absStarting * 0.25) },
		{ label: "Paid off", thresholdInCents: 0 },
	];
}

export interface MilestoneWithReached {
	id: number;
	thresholdInCents: number;
	reachedAt: Date | null;
}

export function checkMilestones(params: {
	currentBalanceInCents: number;
	milestones: MilestoneWithReached[];
}): number[] {
	const { currentBalanceInCents, milestones } = params;
	const absCurrent = Math.abs(currentBalanceInCents);

	const newlyReached: number[] = [];
	for (const milestone of milestones) {
		if (milestone.reachedAt !== null) continue;
		if (absCurrent <= milestone.thresholdInCents) {
			newlyReached.push(milestone.id);
		}
	}

	return newlyReached;
}

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

export function distributeWithdrawalAcrossAccounts(params: {
	amountInCents: number;
	contributions: Array<{ accountId: number; netAllocated: number }>;
}): Array<{ accountId: number; amountInCents: number }> {
	const { amountInCents, contributions } = params;
	const positive = contributions.filter((c) => c.netAllocated > 0);
	const total = positive.reduce((sum, c) => sum + c.netAllocated, 0);

	if (amountInCents <= 0) return [];
	if (total <= 0) {
		throw new Error("NO_ACCOUNT_CONTRIBUTIONS");
	}
	if (amountInCents > total) {
		throw new Error("INSUFFICIENT_ACCOUNT_CONTRIBUTIONS");
	}

	const provisional = positive.map((c) => {
		const raw = (c.netAllocated * amountInCents) / total;
		const base = Math.floor(raw);
		return {
			accountId: c.accountId,
			netAllocated: c.netAllocated,
			base,
			fraction: raw - base,
		};
	});

	const assigned = provisional.reduce((sum, p) => sum + p.base, 0);
	let remainder = amountInCents - assigned;

	provisional.sort((a, b) => {
		if (b.fraction !== a.fraction) return b.fraction - a.fraction;
		return a.accountId - b.accountId;
	});

	for (const item of provisional) {
		if (remainder <= 0) break;
		if (item.base < item.netAllocated) {
			item.base += 1;
			remainder -= 1;
		}
	}

	return provisional
		.map((item) => ({ accountId: item.accountId, amountInCents: item.base }))
		.filter((item) => item.amountInCents > 0);
}
