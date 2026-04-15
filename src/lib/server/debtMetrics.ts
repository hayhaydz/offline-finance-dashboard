import { devLog } from "$lib/server/logger";
import { MS_PER_MONTH } from "$lib/utils/time-constants";
import type { PayoffProjection } from "$lib/types/debt";
export type { PayoffProjection } from "$lib/types/debt";

/**
 * Calculate payoff projection using amortization formula.
 *
 * All monetary values are in pence (cents). APR is in basis points
 * (e.g. 249 = 2.49%).
 *
 * Returns nullable fields when the debt cannot be paid off (payment too
 * small to cover interest, or no payment provided). This is the single
 * consolidated implementation used by both individual debt metrics and
 * strategy comparisons.
 */
export function calculatePayoffProjection(params: {
	balanceInCents: number;
	aprBasisPoints: number | null;
	monthlyPaymentInCents: number;
}): PayoffProjection {
	const { balanceInCents, aprBasisPoints, monthlyPaymentInCents } = params;
	const absBalance = Math.abs(balanceInCents);

	if (absBalance <= 0) {
		return { months: 0, totalInterestInCents: 0, projectedPayoffDate: new Date() };
	}

	if (monthlyPaymentInCents <= 0) {
		return { months: null, totalInterestInCents: null, projectedPayoffDate: null };
	}

	// Treat null APR as 0% interest
	if (!aprBasisPoints || aprBasisPoints === 0) {
		const months = Math.ceil(absBalance / monthlyPaymentInCents);
		const projectedPayoffDate = new Date(Date.now() + months * MS_PER_MONTH);
		return { months, totalInterestInCents: 0, projectedPayoffDate };
	}

	// Convert APR from basis points to monthly decimal rate
	// e.g. 249 bp -> 2.49% annual -> 0.2075% monthly
	const monthlyRate = aprBasisPoints / 10000 / 12;

	const monthlyInterest = absBalance * monthlyRate;
	if (monthlyPaymentInCents <= monthlyInterest) {
		devLog("debtMetrics", "calculatePayoffProjection: payment insufficient", {
			absBalance,
			aprBasisPoints,
			monthlyPaymentInCents,
			monthlyInterest: Math.round(monthlyInterest),
		});
		return { months: null, totalInterestInCents: null, projectedPayoffDate: null };
	}

	// Amortization formula: N = -ln(1 - (r * P) / A) / ln(1 + r)
	const numerator = -Math.log(1 - (monthlyRate * absBalance) / monthlyPaymentInCents);
	const denominator = Math.log(1 + monthlyRate);
	const months = Math.ceil(numerator / denominator);

	const totalPaidInCents = monthlyPaymentInCents * months;
	const totalInterestInCents = Math.max(0, totalPaidInCents - absBalance);

	const projectedPayoffDate = new Date(Date.now() + months * MS_PER_MONTH);

	return { months, projectedPayoffDate, totalInterestInCents };
}

/**
 * Determine a sensible default monthly payment for payoff projections.
 *
 * Strategy:
 *  1. If a minimum payment is available, use 2x that amount.
 *  2. Otherwise fall back to the recent average payment.
 *  3. If neither is available, use a £100 hard-coded fallback.
 *
 * All values are in pence.
 */
export function getDefaultMonthlyPayment(
	minimumPayment: number | null,
	recentAverage: number | null,
): number {
	if (minimumPayment !== null && minimumPayment > 0) {
		return minimumPayment * 2;
	}
	if (recentAverage !== null && recentAverage > 0) {
		return recentAverage;
	}
	return 10000; // £100 fallback
}

/**
 * Calculate the average payment amount from recent transaction history.
 *
 * Only considers negative-amount transactions (payments toward debt)
 * within the last `monthsToConsider` months.
 *
 * @returns  Average payment in pence, or null when no qualifying payments exist
 */
export function calculateRecentAveragePayment(
	transactions: ReadonlyArray<{ amount: number; createdAt: Date }>,
	monthsToConsider = 3,
): number | null {
	const cutoffDate = new Date();
	cutoffDate.setMonth(cutoffDate.getMonth() - monthsToConsider);

	const recentPayments = transactions.filter(
		(t) => t.amount < 0 && t.createdAt >= cutoffDate,
	);

	if (recentPayments.length === 0) {
		return null;
	}

	const totalPaid = recentPayments.reduce(
		(sum, t) => sum + Math.abs(t.amount),
		0,
	);
	return Math.round(totalPaid / recentPayments.length);
}

/**
 * Get the current APR from a list of interest rate records.
 *
 * Returns the rate with the most recent `effectiveFrom` date,
 * or null when the list is empty.
 */
export function getCurrentApr(
	interestRates: ReadonlyArray<
		Pick<{ rate: number; effectiveFrom: Date }, "rate" | "effectiveFrom">
	>,
): number | null {
	if (interestRates.length === 0) {
		return null;
	}

	const sortedRates = [...interestRates].sort(
		(a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
	);

	return sortedRates[0].rate;
}
