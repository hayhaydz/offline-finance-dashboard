/** Minimal TTZ result shape needed by the scenario formatters. */
interface TTZResult {
	months: number | null;
	totalInterest: number | null;
}

export interface OverpaymentScenario {
	label: string;
	payment: number;
	ttzMonths: number | null;
	totalInterest: number | null;
	debtFreeDate: string | null;
}

export interface RateStressScenario {
	label: string;
	rate: number;
	ttzMonths: number | null;
	ttzDelta: number | null;
	totalInterest: number | null;
	debtFreeDate: string | null;
}

/**
 * Format pre-computed overpayment scenarios.
 * The caller runs calculateTTZ per multiplier — this function handles
 * labeling, payment calculation, and debt-free date formatting.
 */
export function buildOverpaymentScenarios(
	scenarios: Array<{ multiplier: number; ttzResult: TTZResult }>,
	currentPayment: number,
	now: Date,
): OverpaymentScenario[] {
	return scenarios.map(({ multiplier, ttzResult }) => {
		const payment = Math.round(currentPayment * multiplier);
		const label =
			multiplier === 1
				? "Minimum"
				: `+${Math.round((multiplier - 1) * 100)}%`;

		let debtFreeDate: string | null = null;
		if (ttzResult.months !== null) {
			const d = new Date(now);
			d.setMonth(d.getMonth() + ttzResult.months);
			debtFreeDate = d.toLocaleDateString("en-GB", {
				month: "short",
				year: "numeric",
			});
		}

		return {
			label,
			payment,
			ttzMonths: ttzResult.months,
			totalInterest: ttzResult.totalInterest,
			debtFreeDate,
		};
	});
}

/**
 * Format pre-computed rate stress scenarios.
 * The caller runs calculateTTZ per basis-point delta — this function
 * handles labeling, month capping at 300, delta computation, and date formatting.
 */
export function buildRateStressScenarios(
	scenarios: Array<{
		basisPointDelta: number;
		scenarioRate: number;
		ttzResult: TTZResult;
	}>,
	baseTTZMonths: number | null,
	now: Date,
): RateStressScenario[] {
	return scenarios.map(({ basisPointDelta, scenarioRate, ttzResult }) => {
		const cappedMonths =
			ttzResult.months !== null ? Math.min(ttzResult.months, 300) : null;

		let debtFreeDate: string | null = null;
		if (cappedMonths !== null) {
			const d = new Date(now);
			d.setMonth(d.getMonth() + cappedMonths);
			debtFreeDate = d.toLocaleDateString("en-GB", {
				month: "short",
				year: "numeric",
			});
		}

		const ttzDelta =
			cappedMonths !== null && baseTTZMonths !== null
				? cappedMonths - baseTTZMonths
				: null;

		return {
			label: `+${basisPointDelta / 100}%`,
			rate: scenarioRate,
			ttzMonths: cappedMonths,
			ttzDelta,
			totalInterest: ttzResult.totalInterest,
			debtFreeDate,
		};
	});
}

/**
 * Find the month where cumulative interest paid exceeds the original principal.
 * Returns null if the projection never exceeds the principal (e.g., interest-only).
 * Pure computation — no DB access.
 */
export function calculateBreakEvenMonth(
	projection: Array<{ month: number; interest: number; balance: number }>,
	originalPrincipal: number,
): number | null {
	if (projection.length === 0) return null;

	let cumulative = 0;
	for (const row of projection) {
		cumulative += row.interest;
		if (cumulative >= originalPrincipal) {
			return row.month;
		}
	}
	return null;
}
