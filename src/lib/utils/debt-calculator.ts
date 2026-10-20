import type { MonthProjection, PaymentRule, TTZResult } from "$lib/types/debt";

export function calculateTTZ(
	balance: number,
	rate: number,
	paymentRule: PaymentRule,
): TTZResult {
	const MONTHS_CAP = 360;
	const monthlyRate = rate / 12 / 10000;

	let currentBalance = balance;
	let totalInterest = 0;
	const projection: MonthProjection[] = [];

	// Handle zero balance edge case
	if (currentBalance <= 0) {
		return { months: 0, years: 0, totalInterest: 0, projection: [] };
	}

	for (let month = 1; month <= MONTHS_CAP; month++) {
		const interest = Math.round(currentBalance * monthlyRate);
		const payment = calculateMinimumPayment(currentBalance, paymentRule);

		projection.push({ month, balance: currentBalance, interest, payment });

		totalInterest += interest;
		currentBalance = currentBalance + interest - payment;

		if (currentBalance <= 0) {
			return { months: month, years: month / 12, totalInterest, projection };
		}

		if (month > 12 && projection[month - 13].balance <= currentBalance) {
			return { months: null, years: null, totalInterest: null, projection };
		}
	}

	return { months: null, years: null, totalInterest, projection };
}

function calculateMinimumPayment(balance: number, rule: PaymentRule): number {
	if (rule.type === "flat" && rule.flat) return rule.flat;
	if (rule.type === "percentage" && rule.percentage) {
		return Math.round((balance * rule.percentage) / 10000);
	}
	if (rule.type === "flat_or_percentage" && rule.flat && rule.percentage) {
		return Math.max(rule.flat, Math.round((balance * rule.percentage) / 10000));
	}
	return Math.round((balance * 250) / 10000); // Default 2.5%
}

/** Why a debt projection could not be computed */
export type ProjectionNullReason =
	| "no_minimum_payment"
	| "payment_below_interest";

/**
 * Determines the reason a TTZ projection is null from the rule inputs.
 * A rule "exists" only when its type and values are set — otherwise the
 * calculator falls back to a 2.5% default and no user rule is configured.
 */
export function getProjectionNullReason(
	months: number | null,
	rule: {
		type: string | null;
		flat?: number | null;
		percentage?: number | null;
	},
): ProjectionNullReason | null {
	if (months !== null) return null;
	const hasRule =
		(rule.type === "flat" && !!rule.flat) ||
		(rule.type === "percentage" && !!rule.percentage) ||
		(rule.type === "flat_or_percentage" && !!rule.flat && !!rule.percentage);
	return hasRule ? "payment_below_interest" : "no_minimum_payment";
}

export type { MonthProjection, PaymentRule, TTZResult } from "$lib/types/debt";
