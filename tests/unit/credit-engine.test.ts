import { describe, expect, it } from "vitest";
import {
	allocatePayments,
	cardSplitSummary,
	chargePlanStatus,
	lastMonthEnd,
	stoozeStatus,
	type CardCharge,
	type CardPayment,
	type CreditCardAccount,
} from "$lib/server/credit-engine";

// v3 B05 credit engine — hand-computed examples (design record test matrix:
// .docs/design/2026-10-29-2025-credit-engine.md).

const stoozeCard: CreditCardAccount = {
	creditMode: "stooze",
	promoEndsAt: new Date("2027-01-15T00:00:00Z"),
	revertAprBps: 2490,
};

const panicCard: CreditCardAccount = {
	creditMode: "panic",
	promoEndsAt: null,
	revertAprBps: 2390,
};

function charge(overrides: Partial<CardCharge> & { id: number }): CardCharge {
	return {
		amountPence: 30_000,
		date: new Date("2026-08-10T00:00:00Z"),
		payoffPlan: "over_time",
		plannedClearBy: null,
		...overrides,
	};
}

function payment(overrides: Partial<CardPayment> & { id: number }): CardPayment {
	return {
		amountPence: 10_000,
		date: new Date("2026-09-05T00:00:00Z"),
		allocatesToId: null,
		...overrides,
	};
}

describe("lastMonthEnd (statement delay horizon)", () => {
	it("returns the last instant of the previous month", () => {
		expect(lastMonthEnd(new Date("2026-10-15T12:00:00Z")).toISOString()).toBe(
			"2026-09-30T23:59:59.999Z",
		);
	});
	it("on the 1st of a month, the horizon is the day before at month-end", () => {
		expect(lastMonthEnd(new Date("2026-10-01T00:00:00Z")).toISOString()).toBe(
			"2026-09-30T23:59:59.999Z",
		);
	});
});

describe("stoozeStatus (R7)", () => {
	it("promo ends in 45 days → daysLeft 45, clearBy 5 days earlier", () => {
		const today = new Date("2026-12-01T00:00:00Z");
		const s = stoozeStatus(stoozeCard, -123_456, today);
		expect(s.stoozing).toBe(true);
		expect(s.daysLeft).toBe(45);
		expect(s.clearBy?.toISOString()).toBe("2027-01-10T00:00:00.000Z");
		expect(s.clearAmountPence).toBe(123_456);
	});
	it("not stoozing when the mode is panic, even with a promo", () => {
		const s = stoozeStatus(
			{ ...panicCard, promoEndsAt: new Date("2027-01-15T00:00:00Z") },
			-50_000,
			new Date("2026-12-01T00:00:00Z"),
		);
		expect(s.stoozing).toBe(false);
	});
	it("promo already past → stoozing false, no clear-by", () => {
		const s = stoozeStatus(stoozeCard, -50_000, new Date("2027-06-01T00:00:00Z"));
		expect(s.stoozing).toBe(false);
		expect(s.clearBy).toBeNull();
	});
});

describe("allocatePayments (waterfall)", () => {
	it("explicit allocations are honoured, general payments fill earliest-deadline charges first", () => {
		const c1 = charge({ id: 1, date: new Date("2026-08-10T00:00:00Z") }); // deadline ~Nov 10
		const c2 = charge({
			id: 2,
			date: new Date("2026-09-20T00:00:00Z"),
			plannedClearBy: new Date("2026-10-01T00:00:00Z"), // earlier deadline
		});
		const paid = allocatePayments(
			[c1, c2],
			[
				payment({ id: 10, amountPence: 5_000, allocatesToId: 1 }), // explicit to c1
				payment({ id: 11, amountPence: 40_000 }), // general: fills c2 first, rest to c1
			],
		);
		expect(paid.get(1)).toBe(15_000); // 5k explicit + 10k of the general (40k − 30k to c2)
		expect(paid.get(2)).toBe(30_000); // general waterfall serves the earlier deadline first
	});
	it("a general payment larger than all debt is capped at the debt total", () => {
		const c1 = charge({ id: 1, amountPence: 12_000 });
		const paid = allocatePayments([c1], [payment({ id: 10, amountPence: 99_000 })]);
		expect(paid.get(1)).toBe(12_000);
	});
});

describe("chargePlanStatus (R8 R20)", () => {
	it("on track: £300 charge 1 month ago with £100 paid → £100/mo × 2 remaining", () => {
		const today = new Date("2026-10-15T00:00:00Z");
		const c = charge({
			id: 1,
			date: new Date("2026-09-10T00:00:00Z"),
			payoffPlan: "over_time",
		});
		// confirmedThrough = Sep 30 → monthsElapsed = 0 (charge month Sep == confirmed month Sep)
		const s = chargePlanStatus(
			c,
			[payment({ id: 10, amountPence: 10_000, date: new Date("2026-09-15T00:00:00Z") })],
			{ creditMode: null, promoEndsAt: null, revertAprBps: null },
			today,
		);
		expect(s.monthsElapsed).toBe(0);
		expect(s.confirmedPaidPence).toBe(10_000);
		expect(s.requiredPerMonthPence).toBe(Math.round(20_000 / 3)); // remaining 3 months
		expect(s.onTrack).toBe(true); // 0 months elapsed → expected 0
	});

	it("behind: £300 charge 2 months ago, £50 confirmed → behind", () => {
		const today = new Date("2026-11-15T00:00:00Z");
		const c = charge({
			id: 1,
			date: new Date("2026-09-10T00:00:00Z"),
			payoffPlan: "over_time",
		});
		const s = chargePlanStatus(
			c,
			[payment({ id: 10, amountPence: 5_000, date: new Date("2026-10-05T00:00:00Z") })],
			{ creditMode: null, promoEndsAt: null, revertAprBps: null },
			today,
		);
		// confirmedThrough = Oct 31 → monthsElapsed = 1; expectedByNow = 30000/3 = 10000 > 5000
		expect(s.monthsElapsed).toBe(1);
		expect(s.onTrack).toBe(false);
		expect(s.requiredPerMonthPence).toBe(Math.round(25_000 / 2)); // 2 months left
	});

	it("flex cost: £100 remaining 30 days past deadline at 24.9% → ~£2.05", () => {
		const c = charge({
			id: 1,
			amountPence: 30_000,
			date: new Date("2026-05-01T00:00:00Z"),
			plannedClearBy: new Date("2026-06-01T00:00:00Z"), // deadline
		});
		const today = new Date("2026-07-01T00:00:00Z"); // 30 days late
		const paid = 20_000; // £100 remaining
		const s = chargePlanStatus(
			c,
			[payment({ id: 10, amountPence: paid, date: new Date("2026-05-15T00:00:00Z") })],
			{ creditMode: null, promoEndsAt: null, revertAprBps: 2490 },
			today,
		);
		expect(s.remainingPence).toBe(10_000);
		// 10000 × 0.249 × 30/365 = 204.9 → 205 pence
		expect(s.flexCostPence).toBe(205);
	});

	it("promo end caps the deadline when earlier than the 3-month target", () => {
		const c = charge({ id: 1, date: new Date("2026-12-01T00:00:00Z") }); // target 2027-03-01
		const s = chargePlanStatus(
			c,
			[],
			{ ...stoozeCard, creditMode: null }, // promo 2027-01-15 earlier
			new Date("2026-12-15T00:00:00Z"),
		);
		expect(s.deadline.toISOString()).toBe("2027-01-15T00:00:00.000Z");
	});

	it("immediate plan (default) requires the full remaining amount now", () => {
		const c = charge({ id: 1, payoffPlan: null, date: new Date("2026-09-10T00:00:00Z") });
		const s = chargePlanStatus(
			c,
			[payment({ id: 10, amountPence: 4_000, date: new Date("2026-09-20T00:00:00Z") })],
			{ creditMode: null, promoEndsAt: null, revertAprBps: null },
			new Date("2026-10-15T00:00:00Z"),
		);
		expect(s.plan).toBe("immediate");
		expect(s.requiredPerMonthPence).toBe(26_000); // everything, immediately
	});
});

describe("cardSplitSummary (R20 rollup)", () => {
	it("rolls up on/off track, cleared, flex cost and next deadline without double counting", () => {
		const today = new Date("2026-11-15T00:00:00Z");
		const c1 = charge({
			id: 1,
			amountPence: 10_000,
			date: new Date("2026-07-01T00:00:00Z"),
		}); // will be cleared
		const c2 = charge({
			id: 2,
			amountPence: 30_000,
			date: new Date("2026-09-10T00:00:00Z"),
		}); // behind (nothing paid)
		const c3 = charge({
			id: 3,
			amountPence: 30_000,
			date: new Date("2026-10-05T00:00:00Z"),
			payoffPlan: "over_time",
		}); // fresh, on track
		const summary = cardSplitSummary(
			[c1, c2, c3],
			[
				payment({ id: 10, amountPence: 10_000, allocatesToId: 1, date: new Date("2026-08-01T00:00:00Z") }),
				payment({ id: 11, amountPence: 15_000, date: new Date("2026-11-01T00:00:00Z") }), // general → c2 (earlier deadline)
			],
			{ creditMode: null, promoEndsAt: null, revertAprBps: null },
			today,
		);
		expect(summary.chargesTracked).toBe(3);
		expect(summary.clearedCount).toBe(1); // c1
		expect(summary.behindCount).toBe(1); // c2 (expected 30000×1/3=10000 confirmed… paid 0 confirmed through Oct 31)
		expect(summary.onTrackCount).toBe(1); // c3
		expect(summary.totalFlexCostPence).toBe(0); // nothing past deadline yet
		expect(summary.nextDeadline?.toISOString()).toBe("2026-12-10T00:00:00.000Z"); // c2's 3-month target (earliest open)
	});
});
