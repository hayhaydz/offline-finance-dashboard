import { devLog } from "$lib/utils/logger";

export interface PayoffProjection {
	months: number;
	payoffDate: Date;
	totalPaid: number;
	interestPaid: number;
}

/**
 * Calculate payoff projection using amortization formula.
 *
 * All monetary values are in pence (cents). APR is in basis points
 * (e.g. 249 = 2.49%).
 *
 * @param balanceInCents  Current balance in pence (use absolute value for debt)
 * @param aprBasisPoints  APR in basis points (249 = 2.49%)
 * @param monthlyPaymentInCents  Monthly payment in pence
 * @throws  When the monthly payment is too small to ever cover the interest charge
 */
export function calculatePayoffProjection(
	balanceInCents: number,
	aprBasisPoints: number,
	monthlyPaymentInCents: number,
): PayoffProjection {
	const absBalance = Math.abs(balanceInCents);

	if (absBalance === 0) {
		return {
			months: 0,
			payoffDate: new Date(),
			totalPaid: 0,
			interestPaid: 0,
		};
	}

	// Convert APR from basis points to monthly decimal rate
	// e.g. 249 bp -> 2.49% annual -> 0.2075% monthly
	const monthlyRate = (aprBasisPoints / 100) / 12 / 100;

	// Zero interest: simple division
	if (monthlyRate === 0) {
		const months = Math.ceil(absBalance / monthlyPaymentInCents);
		const payoffDate = new Date();
		payoffDate.setMonth(payoffDate.getMonth() + months);
		return {
			months,
			payoffDate,
			totalPaid: months * monthlyPaymentInCents,
			interestPaid: 0,
		};
	}

	// Check that the payment actually reduces the principal
	const monthlyInterest = absBalance * monthlyRate;
	if (monthlyPaymentInCents <= monthlyInterest) {
		const err = new Error(
			"Payment too small to cover interest. Debt will never be paid off.",
		);
		devLog("debtMetrics", "calculatePayoffProjection: payment insufficient", {
			absBalance,
			aprBasisPoints,
			monthlyPaymentInCents,
			monthlyInterest: Math.round(monthlyInterest),
		});
		throw err;
	}

	// Amortization formula: N = -ln(1 - (r * P) / A) / ln(1 + r)
	const numerator = Math.log(1 - (monthlyRate * absBalance) / monthlyPaymentInCents);
	const denominator = Math.log(1 + monthlyRate);
	const months = Math.ceil(-numerator / denominator);

	const payoffDate = new Date();
	payoffDate.setMonth(payoffDate.getMonth() + months);

	const totalPaid = months * monthlyPaymentInCents;
	const interestPaid = totalPaid - absBalance;

	return { months, payoffDate, totalPaid, interestPaid };
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
