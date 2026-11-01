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

	// Month-by-month simulation (mirrors debtMetrics; sweep 9): the final
	// partial payment is charged exactly — no ceil-of-whole-payment
	// overstatement (the old form could invert "faster costs less").
	let balance = absBalance;
	let totalInterest = 0;
	let months = 0;
	while (balance > 0 && months < 1_200) {
		const interest = balance * monthlyRate;
		totalInterest += interest;
		const pay = Math.min(monthlyPaymentInCents, balance + interest);
		balance = balance + interest - pay;
		months += 1;
	}
	return { months, totalInterestInCents: Math.round(totalInterest) };
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

// ---------------------------------------------------------------------------
// v3 B08 (R13): stooze calculator + FI milestone projector
// ---------------------------------------------------------------------------

export interface StoozeResult {
	/** Interest earned in savings over the remaining 0% window (daily compounding) */
	savingsInterestPence: number;
	/** Interest the card would charge if the balance rides PAST the promo
	 *  end for the same number of days at the revert APR */
	revertCostPence: number;
	/** Net advantage of stoozing (earned − cost when both apply) */
	netGainPence: number;
	/** Recommended pay-by date: promo end minus 5 working-ish days */
	clearByDate: string | null;
	daysRemaining: number;
}

/**
 * Stooze economics: a 0% balance parked while savings earn. Interest is
 * daily-compounded on a 365-day year (banks vary; this is the honest
 * approximation). Negative/NaN inputs degrade to zeros.
 */
export function stoozeCalculation(params: {
	balancePence: number;
	savingsRateBasisPoints: number;
	revertAprBasisPoints: number;
	promoEndsAt: Date | null;
	today?: Date;
}): StoozeResult {
	const today = params.today ?? new Date();
	const balance = Math.max(0, finite(params.balancePence));
	const savingsDaily = Math.max(0, finite(params.savingsRateBasisPoints)) / 10_000 / 365;
	const revertDaily = Math.max(0, finite(params.revertAprBasisPoints)) / 10_000 / 365;

	const daysRemaining = params.promoEndsAt
		? Math.max(0, Math.ceil((params.promoEndsAt.getTime() - today.getTime()) / 86_400_000))
		: 0;

	const savingsInterestPence = Math.round(
		balance * (Math.pow(1 + savingsDaily, daysRemaining) - 1),
	);
	const revertCostPence = Math.round(
		balance * (Math.pow(1 + revertDaily, daysRemaining) - 1),
	);
	const clearBy = params.promoEndsAt
		? new Date(params.promoEndsAt.getTime() - 5 * 86_400_000)
		: null;

	return {
		savingsInterestPence,
		revertCostPence,
		netGainPence: savingsInterestPence - revertCostPence,
		clearByDate: clearBy ? clearBy.toISOString().slice(0, 10) : null,
		daysRemaining,
	};
}

export interface FiMilestone {
	targetPence: number;
	/** Months from the last history point until the target is crossed (null = never) */
	monthsFromNow: number | null;
	date: string | null;
	/** v3.1 third mandate: falling slopes project DOWNWARD £10k crossings */
	direction: "up" | "down";
}

/**
 * FI milestone projector: fit the mean monthly net-worth delta over the
 * history window, then project crossings. Rising slopes get the
 * power-of-ten ladder above the current net worth (up to £1M); falling
 * slopes (v3.1 third mandate) get the next six DOWNWARD £10k crossings —
 * a falling window is exactly when drift readings matter most, and an
 * honest tool should not render one gray line on a 1584px canvas. Flat
 * slopes return never. Uses the mean delta (robust to noisy months).
 */
export function projectMilestones(params: {
	history: { date: string; netWorthInCents: number }[];
	today?: Date;
}): FiMilestone[] {
	const { history } = params;
	const today = params.today ?? new Date();
	if (history.length < 2) return [];

	const latest = history[history.length - 1];
	const first = history[0];
	const firstMs = new Date(`${first.date}T00:00:00.000Z`).getTime();
	const latestMs = new Date(`${latest.date}T00:00:00.000Z`).getTime();
	const monthsInWindow = Math.max(
		1,
		Math.round((latestMs - firstMs) / (30.44 * 86_400_000)),
	);
	const monthlyDelta =
		(latest.netWorthInCents - first.netWorthInCents) / monthsInWindow;
	if (monthlyDelta === 0) return [];

	const STEP = 10_000 * 100; // £10k in pence
	const out: FiMilestone[] = [];

	if (monthlyDelta > 0) {
		let target = STEP;
		while (target <= 100_000_000) {
			if (target > latest.netWorthInCents) {
				const gap = target - latest.netWorthInCents;
				const months = Math.ceil(gap / monthlyDelta);
				const date = new Date(latestMs + months * 30.44 * 86_400_000);
				out.push({
					targetPence: target,
					monthsFromNow: months,
					date: date.toISOString().slice(0, 10),
					direction: "up",
				});
				if (out.length >= 6) break;
			}
			target *= 10;
		}
		return out;
	}

	// falling slope: the next £10k boundaries STRICTLY below current net
	// worth, descending, six rows max. floor() already lands on the next
	// boundary at-or-below; subtract a step only when exactly on one.
	const drift = Math.abs(monthlyDelta);
	let target = Math.floor(latest.netWorthInCents / STEP) * STEP;
	if (target >= latest.netWorthInCents) target -= STEP;
	while (target >= -100_000_000) {
		const gap = latest.netWorthInCents - target;
		const months = Math.ceil(gap / drift);
		const date = new Date(latestMs + months * 30.44 * 86_400_000);
		out.push({
			targetPence: target,
			monthsFromNow: months,
			date: date.toISOString().slice(0, 10),
			direction: "down",
		});
		if (out.length >= 6) break;
		target -= STEP;
	}
	return out;
}

export interface OverpayVsSaveResult {
	/** savings rate after tax on interest (bps); ISA = gross */
	netSavingsBasisPoints: number;
	/** debt APR minus net savings rate (bps) — positive means overpaying wins */
	advantageBasisPoints: number;
	/** yearly benefit of overpaying vs saving, per £1,000 (pence, simple, no compounding) */
	benefitPer1000Pence: number;
	/** first-year benefit of directing `extraMonthlyPence` to the debt instead of savings (pence) */
	firstYearBenefitPence: number;
}

/**
 * Overpay-or-save (v3 R-H16): overpaying a debt "earns" the APR
 * risk-free and tax-free (interest never charged); saving earns the
 * gross rate taxed as interest at the marginal band (unless ISA).
 * Simple one-year approximation, no compounding — stated in the UI.
 */
export function overpayVsSave(params: {
	aprBasisPoints: number;
	savingsRateBasisPoints: number;
	inIsa: boolean;
	/** marginal income-tax rate as a percent (20/40/45) */
	bandRatePercent: number;
	extraMonthlyPence: number;
}): OverpayVsSaveResult {
	const apr = Math.max(0, finite(params.aprBasisPoints));
	const gross = Math.max(0, finite(params.savingsRateBasisPoints));
	const net = params.inIsa
		? gross
		: Math.round(gross * (1 - Math.min(100, Math.max(0, finite(params.bandRatePercent))) / 100));
	const advantage = apr - net;
	const benefitPer1000 = Math.round((advantage / 10_000) * 100_000);
	const extraYear = Math.max(0, finite(params.extraMonthlyPence)) * 12;
	const firstYear = Math.round((advantage / 10_000) * extraYear);
	return {
		netSavingsBasisPoints: net,
		advantageBasisPoints: advantage,
		benefitPer1000Pence: benefitPer1000,
		firstYearBenefitPence: firstYear,
	};
}

/**
 * Statement gap finder (v3.2 harvest, 2026-11-01): the statement model's
 * own blind-spot tool — within an account's FIRST→LAST declared month
 * range, which months carry zero transactions. Statement-honest (D0):
 * months BEFORE the first declaration are not gaps (the account may not
 * have existed); only interior holes are claimed.
 */
export function findMissingStatementMonths(
	firstMonth: string,
	lastMonth: string,
	declaredMonths: string[],
): string[] {
	const declared = new Set(declaredMonths);
	if (!/^\d{4}-\d{2}$/.test(firstMonth) || !/^\d{4}-\d{2}$/.test(lastMonth)) return [];
	const [fy, fm] = firstMonth.split("-").map(Number);
	const [ly, lm] = lastMonth.split("-").map(Number);
	const missing: string[] = [];
	let y = fy;
	let m = fm;
	while (y < ly || (y === ly && m <= lm)) {
		const key = `${y}-${String(m).padStart(2, "0")}`;
		if (!declared.has(key) && key !== lastMonth) missing.push(key);
		m++;
		if (m > 12) { m = 1; y++; }
	}
	return missing;
}
