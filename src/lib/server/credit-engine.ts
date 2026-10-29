/**
 * Credit engine (v3 B05 / R7 R8 R20) — pure functions, no DB access.
 *
 * Concepts (design record: .docs/design/2026-10-29-2025-credit-engine.md):
 * - PANIC vs STOOZE per-account modes: panic = actively paying down,
 *   stooze = riding a 0% promo while savings earn (reminders, no pressure).
 * - Monzo-method plans per charge: 'immediate' (clear with next statement)
 *   or 'over_time' (tracked split). NULL plan = card default 'immediate'.
 * - 0% split tracker (R20): target each charge cleared within 3 months of
 *   use; statement-delay reality: statements arrive end-of-month, so
 *   "confirmed" data runs through the LAST MONTH-END (1-month lag).
 * - Cost beyond the interest-free period (R8): simple daily accrual at the
 *   card's revert APR on the remaining balance after the deadline.
 */

export interface CreditCardAccount {
	creditMode: "panic" | "stooze" | null;
	promoEndsAt: Date | null;
	revertAprBps: number | null;
}

export interface CardCharge {
	id: number;
	/** Positive pence of the purchase. */
	amountPence: number;
	date: Date;
	payoffPlan: "immediate" | "over_time" | null;
	plannedClearBy: Date | null;
}

export interface CardPayment {
	id: number;
	/** Positive pence paid toward debt. */
	amountPence: number;
	date: Date;
	/** Charge id this payment pays down; null = general (waterfall). */
	allocatesToId: number | null;
}

export interface StoozeStatus {
	stoozing: boolean;
	promoEndsAt: Date | null;
	/** Days until the 0% window closes (negative if past). Null when no promo. */
	daysLeft: number | null;
	/** Payment-clearing buffer date: promo end minus 5 days. */
	clearBy: Date | null;
	/** What must be paid by clearBy to avoid revert interest. */
	clearAmountPence: number | null;
}

export interface ChargePlanStatus {
	chargeId: number;
	plan: "immediate" | "over_time";
	/** Deadline used: min(plannedClearBy ?? charge+3mo, promoEndsAt). */
	deadline: Date;
	targetMonths: number;
	/** Whole months between the charge month and the confirmed-through month. */
	monthsElapsed: number;
	/** Month-end the confirmed numbers run through (statement delay). */
	confirmedThrough: Date;
	confirmedPaidPence: number;
	remainingPence: number;
	/** What each remaining month must pay to hit the target. */
	requiredPerMonthPence: number;
	onTrack: boolean;
	/** Interest already accrued past the deadline at the revert APR. */
	flexCostPence: number;
}

const MS_PER_DAY = 86_400_000;
/** Payment clearing buffer before a promo ends (days). */
export const CLEAR_BY_BUFFER_DAYS = 5;
/** R20 default target: clear each 0% charge within 3 months of use. */
export const SPLIT_TARGET_MONTHS = 3;

function addMonths(date: Date, months: number): Date {
	const d = new Date(date.getTime());
	const day = d.getUTCDate();
	d.setUTCMonth(d.getUTCMonth() + months);
	// clamp overflow (e.g. Jan 31 + 1mo → Mar 3 would be wrong)
	if (d.getUTCDate() < day) d.setUTCDate(0);
	return d;
}

function daysBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Last month-end strictly BEFORE `today` (UTC) — the statement-delay
 *  horizon: statements arrive end-of-month, so confirmed data lags. */
export function lastMonthEnd(today: Date): Date {
	const firstOfMonth = new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0),
	);
	return new Date(firstOfMonth.getTime() - 1);
}

/** Stooze reminders for a card in stooze mode (R7). Returns stoozing=false
 *  for anything without a future promo window or not in stooze mode. */
export function stoozeStatus(
	account: CreditCardAccount,
	balancePence: number,
	today: Date,
): StoozeStatus {
	if (account.creditMode !== "stooze" || account.promoEndsAt === null) {
		return {
			stoozing: false,
			promoEndsAt: account.promoEndsAt,
			daysLeft: account.promoEndsAt
				? daysBetween(today, account.promoEndsAt)
				: null,
			clearBy: null,
			clearAmountPence: null,
		};
	}
	const daysLeft = daysBetween(today, account.promoEndsAt);
	const stoozing = daysLeft > 0;
	const clearBy = new Date(
		account.promoEndsAt.getTime() - CLEAR_BY_BUFFER_DAYS * MS_PER_DAY,
	);
	return {
		stoozing,
		promoEndsAt: account.promoEndsAt,
		daysLeft,
		clearBy: stoozing ? clearBy : null,
		clearAmountPence: stoozing ? Math.max(0, Math.abs(balancePence)) : null,
	};
}

/** Waterfall-allocate payments across charges: explicit allocations first
 *  (chronological), then general payments (no allocatesToId) in waterfall
 *  order — earliest deadline (plannedClearBy ?? +3mo), then oldest charge.
 *  Returns chargeId → total paid pence (capped at the charge amount). */
export function allocatePayments(
	charges: CardCharge[],
	payments: CardPayment[],
): Map<number, number> {
	const remaining = new Map<number, number>();
	for (const c of charges) remaining.set(c.id, c.amountPence);

	for (const p of payments
		.filter((p) => p.allocatesToId !== null)
		.sort((a, b) => a.date.getTime() - b.date.getTime())) {
		const rem = remaining.get(p.allocatesToId as number);
		if (rem === undefined) continue;
		remaining.set(p.allocatesToId as number, Math.max(0, rem - p.amountPence));
	}

	const order = [...charges].sort((a, b) => {
		const da = a.plannedClearBy ?? addMonths(a.date, SPLIT_TARGET_MONTHS);
		const db = b.plannedClearBy ?? addMonths(b.date, SPLIT_TARGET_MONTHS);
		return da.getTime() - db.getTime() || a.date.getTime() - b.date.getTime();
	});
	for (const p of payments
		.filter((p) => p.allocatesToId === null)
		.sort((a, b) => a.date.getTime() - b.date.getTime())) {
		let pence = p.amountPence;
		for (const c of order) {
			if (pence <= 0) break;
			const rem = remaining.get(c.id) ?? 0;
			if (rem <= 0) continue;
			const applied = Math.min(rem, pence);
			remaining.set(c.id, rem - applied);
			pence -= applied;
		}
	}

	const paid = new Map<number, number>();
	for (const c of charges)
		paid.set(c.id, c.amountPence - (remaining.get(c.id) ?? 0));
	return paid;
}

/** Split-tracker + flex-cost status for one charge (R8 R20).
 *
 *  NOTE: the passed payments are treated as THE payments for this charge —
 *  a single-charge waterfall. When evaluating a whole card, use
 *  cardSplitSummary (it allocates general payments across all charges
 *  exactly once) instead of summing single-charge calls. */
export function chargePlanStatus(
	charge: CardCharge,
	payments: CardPayment[],
	account: CreditCardAccount,
	today: Date,
): ChargePlanStatus {
	const confirmedThrough = lastMonthEnd(today);
	const explicit = payments
		.filter((p) => p.allocatesToId === charge.id)
		.reduce((s, p) => s + p.amountPence, 0);
	const general = payments
		.filter((p) => p.allocatesToId === null)
		.reduce((s, p) => s + p.amountPence, 0);
	const paidTotal = Math.min(charge.amountPence, explicit + general);
	const explicitConfirmed = payments
		.filter(
			(p) => p.allocatesToId === charge.id && p.date.getTime() <= confirmedThrough.getTime(),
		)
		.reduce((s, p) => s + p.amountPence, 0);
	const generalConfirmed = payments
		.filter(
			(p) => p.allocatesToId === null && p.date.getTime() <= confirmedThrough.getTime(),
		)
		.reduce((s, p) => s + p.amountPence, 0);
	const confirmedPaidPence = Math.min(
		charge.amountPence,
		explicitConfirmed + generalConfirmed,
	);
	return planStatusFromPaid(
		charge,
		account,
		today,
		paidTotal,
		confirmedPaidPence,
		confirmedThrough,
	);
}

/** Shared plan math once paid totals are known. */
function planStatusFromPaid(
	charge: CardCharge,
	account: CreditCardAccount,
	today: Date,
	paidTotalPence: number,
	confirmedPaidPence: number,
	confirmedThrough: Date,
): ChargePlanStatus {
	const plan = charge.payoffPlan ?? "immediate";
	const target =
		charge.plannedClearBy ?? addMonths(charge.date, SPLIT_TARGET_MONTHS);
	const deadline =
		account.promoEndsAt && account.promoEndsAt.getTime() < target.getTime()
			? account.promoEndsAt
			: target;
	const remainingPence = Math.max(0, charge.amountPence - paidTotalPence);

	// months elapsed: charge month → confirmed-through month (whole months)
	const monthsElapsed = Math.max(
		0,
		(confirmedThrough.getUTCFullYear() - charge.date.getUTCFullYear()) * 12 +
			(confirmedThrough.getUTCMonth() - charge.date.getUTCMonth()),
	);
	const targetMonths = Math.max(
		1,
		Math.round(daysBetween(charge.date, deadline) / 30.44),
	);
	const monthsRemaining = Math.max(0, targetMonths - monthsElapsed);
	const remainingForPlan = Math.max(0, charge.amountPence - confirmedPaidPence);
	const requiredPerMonthPence =
		plan === "immediate"
			? remainingForPlan
			: Math.round(remainingForPlan / Math.max(1, monthsRemaining));

	const expectedByNow = (charge.amountPence * monthsElapsed) / targetMonths;
	const onTrack = confirmedPaidPence >= Math.floor(expectedByNow) - 1;

	// flex cost: revert-APR interest on whatever is still outstanding after
	// the deadline, accrued to today (0 while the deadline is in the future)
	const daysLate = Math.max(0, daysBetween(deadline, today));
	const apr = (account.revertAprBps ?? 0) / 10_000;
	const flexCostPence =
		remainingPence > 0
			? Math.round(remainingPence * apr * (daysLate / 365))
			: 0;

	return {
		chargeId: charge.id,
		plan,
		deadline,
		targetMonths,
		monthsElapsed,
		confirmedThrough,
		confirmedPaidPence,
		remainingPence,
		requiredPerMonthPence,
		onTrack,
		flexCostPence,
	};
}

export interface CardSplitSummary {
	chargesTracked: number;
	onTrackCount: number;
	behindCount: number;
	clearedCount: number;
	totalFlexCostPence: number;
	/** Earliest upcoming deadline among uncleared tracked charges. */
	nextDeadline: Date | null;
}

/** Per-card rollup across all charges (R20). Allocates payments ONCE across
 *  the card's charges (explicit + waterfall), then derives each charge's
 *  plan status from its allocated share — no double counting. */
export function cardSplitSummary(
	charges: CardCharge[],
	payments: CardPayment[],
	account: CreditCardAccount,
	today: Date,
): CardSplitSummary {
	const confirmedThrough = lastMonthEnd(today);
	const paidTotal = allocatePayments(charges, payments);
	const paidConfirmed = allocatePayments(
		charges,
		payments.filter(
			(p) => p.date.getTime() <= confirmedThrough.getTime(),
		),
	);
	const statuses = charges.map((c) =>
		planStatusFromPaid(
			c,
			account,
			today,
			paidTotal.get(c.id) ?? 0,
			paidConfirmed.get(c.id) ?? 0,
			confirmedThrough,
		),
	);
	let nextDeadline: Date | null = null;
	for (const s of statuses) {
		if (s.remainingPence <= 0) continue;
		if (
			s.deadline.getTime() > today.getTime() &&
			(nextDeadline === null || s.deadline.getTime() < nextDeadline.getTime())
		) {
			nextDeadline = s.deadline;
		}
	}
	return {
		chargesTracked: statuses.length,
		onTrackCount: statuses.filter((s) => s.remainingPence > 0 && s.onTrack)
			.length,
		behindCount: statuses.filter((s) => s.remainingPence > 0 && !s.onTrack)
			.length,
		clearedCount: statuses.filter((s) => s.remainingPence <= 0).length,
		totalFlexCostPence: statuses.reduce((s, x) => s + x.flexCostPence, 0),
		nextDeadline,
	};
}
