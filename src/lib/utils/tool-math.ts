/**
 * Tool math (Phase 6): pure, client-safe what-if formulas for the Tools
 * module. These mirror the server engines exactly:
 *
 * - `simulatePayoff` mirrors `calculatePayoffProjection` (debtMetrics.ts)
 *   — same closed-form amortization (N = -ln(1 - rP/A) / ln(1+r)), same
 *   null-APR and insufficient-payment semantics. Parity is unit-tested
 *   against the server engine.
 * - interest/PSA math mirrors the interestBreakdown + tax-year-utils
 *   conventions (pence everywhere, basis-point rates).
 */

import type { TaxBand } from "$lib/utils/tax-year-utils";

/** Marginal tax rate on savings interest by band (interest above the PSA
 *  is taxed at the band rate: 20% basic / 40% higher / 45% additional). */
export const BAND_RATE_PCT: Record<TaxBand, number> = {
	basic: 20,
	higher: 40,
	additional: 45,
};

/** Simple annual interest: balance × rate. 455bp on £10,000 → £455. */
export function yearlyInterestPence(
	balanceInCents: number,
	rateBasisPoints: number,
): number {
	if (!Number.isFinite(balanceInCents) || !Number.isFinite(rateBasisPoints))
		return 0;
	return Math.round((balanceInCents * rateBasisPoints) / 10_000);
}

/** Tax due on savings interest: only the portion ABOVE the PSA is taxed
 *  at the band rate. £0 when within the allowance (or £0 allowance is
 *  handled by the caller passing allowancePence=0 → everything taxed). */
export function taxOnInterestPence(
	taxableInterestPence: number,
	allowancePence: number,
	bandRatePct: number,
): number {
	const over = Math.max(0, taxableInterestPence - allowancePence);
	return Math.round((over * bandRatePct) / 100);
}

/** Total interest after moving `principalMovedPence` from taxable accounts
 *  into an ISA (that slice earns interest tax-free at the same rate). */
export function isaMoveTaxSavedPence(params: {
	principalMovedPence: number;
	rateBasisPoints: number;
	taxableInterestPence: number;
	allowancePence: number;
	bandRatePct: number;
}): number {
	const { principalMovedPence, rateBasisPoints, taxableInterestPence } = params;
	const before = taxOnInterestPence(
		taxableInterestPence,
		params.allowancePence,
		params.bandRatePct,
	);
	const after = taxOnInterestPence(
		taxableInterestPence - yearlyInterestPence(principalMovedPence, rateBasisPoints),
		params.allowancePence,
		params.bandRatePct,
	);
	return Math.max(0, before - after);
}

export interface PayoffScenario {
	months: number | null;
	totalInterestInCents: number | null;
}

/**
 * Payoff months + total interest — mirrors the server engine
 * (calculatePayoffProjection) so the overpayment simulator shows the SAME
 * numbers the debt report does. Null months = payment never covers
 * interest. Null/0 APR = straight-line division, zero interest.
 */
export function simulatePayoff(params: {
	balanceInCents: number;
	aprBasisPoints: number | null;
	monthlyPaymentInCents: number;
}): PayoffScenario {
	const { balanceInCents, aprBasisPoints, monthlyPaymentInCents } = params;
	const absBalance = Math.abs(balanceInCents);

	if (absBalance <= 0) return { months: 0, totalInterestInCents: 0 };
	if (monthlyPaymentInCents <= 0) return { months: null, totalInterestInCents: null };

	if (!aprBasisPoints || aprBasisPoints === 0) {
		return {
			months: Math.ceil(absBalance / monthlyPaymentInCents),
			totalInterestInCents: 0,
		};
	}

	const monthlyRate = aprBasisPoints / 10_000 / 12;
	const monthlyInterest = absBalance * monthlyRate;
	if (monthlyPaymentInCents <= monthlyInterest) {
		return { months: null, totalInterestInCents: null };
	}

	const months = Math.ceil(
		-Math.log(1 - (monthlyRate * absBalance) / monthlyPaymentInCents) /
			Math.log(1 + monthlyRate),
	);
	return {
		months,
		totalInterestInCents: Math.max(0, monthlyPaymentInCents * months - absBalance),
	};
}

export interface CompoundPoint {
	/** 0 = today, 1 = after one year, … */
	year: number;
	balancePence: number;
	contributedPence: number;
	interestPence: number;
}

/** Coerce a possibly-NaN/Infinity typed input to a finite number
 *  (Svelte number inputs bind '' → undefined → NaN through arithmetic). */
function finite(value: number, fallback = 0): number {
	return Number.isFinite(value) ? value : fallback;
}

/** Input ceilings mirroring the tool form constraints (typed values are
 *  not bound by the HTML min/max attributes, which only advise). */
const MAX_RATE_BP = 1500; // 15.00% — matches the rate input's max
const MAX_YEARS = 40; // matches the years input's max

/**
 * Monthly-compounded savings projection: balance grows by rate/12 each
 * month, `monthlyPence` is added at the end of each month. Sampled at
 * whole years (plus the start point). Inputs are clamped to the form's
 * documented ranges — typed negatives/NaN (number inputs ignore min/max
 * when typed into) degrade to honest projections, never NaN paths.
 */
export function compoundSeries(params: {
	principalPence: number;
	monthlyPence: number;
	rateBasisPoints: number;
	years: number;
}): CompoundPoint[] {
	const principalPence = Math.max(0, finite(params.principalPence));
	const monthlyPence = Math.max(0, finite(params.monthlyPence));
	const rateBasisPoints = Math.min(
		MAX_RATE_BP,
		Math.max(0, finite(params.rateBasisPoints)),
	);
	const years = Math.min(MAX_YEARS, Math.max(0, finite(params.years)));
	const monthlyRate = rateBasisPoints / 10_000 / 12;
	const totalMonths = Math.round(years * 12);

	const points: CompoundPoint[] = [
		{ year: 0, balancePence: Math.round(principalPence), contributedPence: Math.round(principalPence), interestPence: 0 },
	];

	let balance = principalPence;
	let contributed = principalPence;
	for (let m = 1; m <= totalMonths; m++) {
		balance = balance * (1 + monthlyRate) + monthlyPence;
		contributed += monthlyPence;
		if (m % 12 === 0) {
			const rounded = Math.round(balance);
			points.push({
				year: m / 12,
				balancePence: rounded,
				contributedPence: Math.round(contributed),
				interestPence: Math.round(rounded - contributed),
			});
		}
	}
	return points;
}
