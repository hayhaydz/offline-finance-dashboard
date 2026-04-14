/**
 * Goal Type Definitions
 *
 * Central type definitions for goal calculations, milestones, and progress tracking.
 * Extracted from server module to provide a single source of truth.
 *
 * Re-exported by goals.ts for backward compatibility.
 */

/** Account allocation with liquidity info */
export interface AccountAllocationWithLiquidity {
	netAllocated: number;
	liquidity: string | null;
}

/** Liquidity breakdown across instant/delayed/locked access */
export interface LiquidityBreakdown {
	instantPercent: number;
	delayedPercent: number;
	lockedPercent: number;
	totalAllocatedInCents: number;
	hasLiquidityWarning: boolean;
	warningMessage: string | null;
}

/** Pace metrics for tracking goal progress against target date */
export interface PaceMetrics {
	daysRemaining: number | null;
	amountRemainingInCents: number;
	requiredMonthlyInCents: number | null;
	actualMonthlyAvgInCents: number;
	projectedCompletionDate: Date | null;
	onTrack: boolean | null; // true if projected <= target
}

/** Minimal allocation history entry for calculations */
export interface AllocationHistoryEntry {
	amount: number;
	createdAt: Date;
	type: string;
}

/** Contribution statistics from allocation history */
export interface ContributionStats {
	daysSinceLastContribution: number | null;
	totalContributions: number;
	totalWithdrawals: number;
	netContributedInCents: number;
	firstContributionDate: Date | null;
	lastContributionDate: Date | null;
}

/** Debt goal progress tracking */
export interface DebtGoalProgress {
	paidInCents: number;
	totalInCents: number;
	percent: number;
	remainingInCents: number;
	debtGrewBeyondStarting: boolean;
}

/** Template for generating default milestones */
export interface MilestoneTemplate {
	label: string;
	thresholdInCents: number;
}

/** Milestone with reached-at tracking */
export interface MilestoneWithReached {
	id: number;
	thresholdInCents: number;
	reachedAt: Date | null;
}
