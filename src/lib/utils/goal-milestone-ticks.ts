/**
 * Goal milestone → bullet-bar tick positions (Phase 4 V1 #3).
 *
 * Pure mapping shared by every goal surface (Goals list GoalRow, Home
 * GoalCard/DebtCard). Ticks are percentages along the progress bar:
 *  - Emergency fund: derived 1mo/3mo/6mo/12mo at 1/12, 3/12, 6/12, 12/12
 *    of the target (target = 12 months of expenses by construction).
 *  - Debt goals: DB milestones with thresholdInCents = remaining-balance
 *    level; reached when |balance| <= threshold (checkMilestones
 *    semantics). Tick % = fraction of the starting balance paid off.
 */

export interface GoalTick {
	/** Position along the bar, 0–100 */
	pct: number;
	label: string;
	achieved: boolean;
}

const MONTHS = [1, 3, 6, 12] as const;

/** Emergency-fund ticks: 1mo/3mo/6mo/12mo at their exact target fractions. */
export function emergencyFundTicks(
	targetInCents: number,
	currentAllocationInCents: number,
): GoalTick[] {
	if (targetInCents <= 0) return [];
	const monthly = targetInCents / 12;
	return MONTHS.map((m) => ({
		pct: Math.round((m / 12) * 1000) / 10, // 8.3 / 25 / 50 / 100
		label: `${m}mo`,
		achieved: currentAllocationInCents >= monthly * m,
	}));
}

/**
 * Debt-goal ticks from DB milestone rows. `achieved` mirrors
 * syncMilestones exactly (|balance| <= threshold), so a tick can turn
 * gray again if the debt regrows past it.
 */
export function debtTicks(
	startingBalanceInCents: number,
	currentBalanceInCents: number,
	milestones: Array<{ label: string; thresholdInCents: number; reachedAt: Date | string | null }>,
): GoalTick[] {
	const absStart = Math.abs(startingBalanceInCents);
	if (absStart === 0 || milestones.length === 0) return [];
	const absCurrent = Math.abs(currentBalanceInCents);

	return milestones
		.map((m) => {
			const absThreshold = Math.abs(m.thresholdInCents);
			return {
				pct: Math.min(100, Math.max(0, ((absStart - absThreshold) / absStart) * 100)),
				label: m.label,
				achieved: m.reachedAt !== null || absCurrent <= absThreshold,
			};
		})
		.sort((a, b) => a.pct - b.pct);
}
