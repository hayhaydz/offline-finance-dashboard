import { MS_PER_DAY, MS_PER_MONTH } from "$lib/utils/time-constants";
import { devLog } from "$lib/server/logger";
import type {
	AccountAllocationWithLiquidity,
	AllocationHistoryEntry,
	ContributionStats,
	DebtGoalProgress,
	LiquidityBreakdown,
	MilestoneTemplate,
	MilestoneWithReached,
	PaceMetrics,
} from "$lib/types/goals";

// Re-export types for backward compatibility
export type {
	AccountAllocationWithLiquidity,
	AllocationHistoryEntry,
	ContributionStats,
	DebtGoalProgress,
	LiquidityBreakdown,
	MilestoneTemplate,
	MilestoneWithReached,
	PaceMetrics,
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
	devLog("calculateLiquidityBreakdown", "Calculating liquidity breakdown", { allocationCount: accountAllocations.length });
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
			(new Date(targetDate).getTime() - now.getTime()) / MS_PER_DAY,
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


/**
 * Calculate contribution statistics from allocation history.
 */
export function calculateContributionStats(
	allocationHistory: AllocationHistoryEntry[],
): ContributionStats {
	devLog("calculateContributionStats", "Calculating contribution stats", { entryCount: allocationHistory.length });
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
			(now.getTime() - last.getTime()) / MS_PER_DAY,
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
	devLog("calculatePaceMetrics", "Calculating pace metrics");
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
		daysRemaining = Math.max(0, Math.ceil(diffMs / MS_PER_DAY));

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
			(now.getTime() - first.getTime()) / MS_PER_MONTH,
		);
		actualMonthlyAvgInCents = Math.round(
			currentAllocationInCents / monthsSinceFirst,
		);

		// Project completion date
		if (actualMonthlyAvgInCents > 0 && amountRemainingInCents > 0) {
			const monthsUntilComplete =
				amountRemainingInCents / actualMonthlyAvgInCents;
			projectedCompletionDate = new Date(
				now.getTime() + monthsUntilComplete * MS_PER_MONTH,
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

export function getDebtGoalProgress(params: {
	startingBalanceInCents: number;
	currentBalanceInCents: number;
}): DebtGoalProgress {
	devLog("getDebtGoalProgress", "Calculating debt goal progress");
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
	devLog("projectPayoffDate", "Projecting payoff date");
	const { remainingInCents, totalPaidInCents, firstPaymentDate } = params;

	if (!firstPaymentDate || totalPaidInCents <= 0 || remainingInCents <= 0) {
		return null;
	}

	const now = new Date();
	const msPerMonth = MS_PER_MONTH;
	const monthsSinceFirst = Math.max(
		1,
		(now.getTime() - firstPaymentDate.getTime()) / msPerMonth,
	);
	const avgMonthlyPayment = Math.round(totalPaidInCents / monthsSinceFirst);

	if (avgMonthlyPayment <= 0) return null;

	const monthsUntilPayoff = remainingInCents / avgMonthlyPayment;
	return new Date(now.getTime() + monthsUntilPayoff * msPerMonth);
}

export function generateDefaultMilestones(params: {
	startingBalanceInCents: number;
}): MilestoneTemplate[] {
	devLog("generateDefaultMilestones", "Generating default milestones");
	const { startingBalanceInCents } = params;
	const absStarting = Math.abs(startingBalanceInCents);

	return [
		{ label: "25% paid off", thresholdInCents: Math.round(absStarting * 0.75) },
		{ label: "Halfway there", thresholdInCents: Math.round(absStarting * 0.5) },
		{ label: "75% paid off", thresholdInCents: Math.round(absStarting * 0.25) },
		{ label: "Paid off", thresholdInCents: 0 },
	];
}

export function checkMilestones(params: {
	currentBalanceInCents: number;
	milestones: MilestoneWithReached[];
}): number[] {
	devLog("checkMilestones", "Checking milestones");
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

/**
 * Distribute a withdrawal amount proportionally across contributing accounts.
 * Pure calculation — no DB access.
 */
export function distributeWithdrawalAcrossAccounts(params: {
	amountInCents: number;
	contributions: Array<{ accountId: number; netAllocated: number }>;
}): Array<{ accountId: number; amountInCents: number }> {
	devLog("distributeWithdrawalAcrossAccounts", "Distributing withdrawal", { amount: params.amountInCents });
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
