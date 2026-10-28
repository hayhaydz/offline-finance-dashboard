import { describe, expect, it } from "vitest";
import {
	debtTicks,
	emergencyFundTicks,
} from "$lib/utils/goal-milestone-ticks";

// Phase 4 V1 #3: milestone → tick-position mapping. The % positions and
// achieved flags must mirror the established milestone semantics
// (emergency fund = allocation vs months of expenses; debt = |balance|
// vs threshold, syncMilestones-compatible).

describe("emergencyFundTicks", () => {
	it("places 1mo/3mo/6mo/12mo at 8.3/25/50/100", () => {
		const ticks = emergencyFundTicks(120000, 0); // £1,200 target = £100/mo
		expect(ticks.map((t) => t.pct)).toEqual([8.3, 25, 50, 100]);
		expect(ticks.map((t) => t.label)).toEqual(["1mo", "3mo", "6mo", "12mo"]);
	});

	it("marks achieved strictly by allocation vs months of expenses", () => {
		// £60 saved against £100/mo → 1mo reached (>= £100? NO, 60 < 100)
		let ticks = emergencyFundTicks(120000, 6000);
		expect(ticks.map((t) => t.achieved)).toEqual([false, false, false, false]);
		// £100 exactly → 1mo reached (boundary is >=)
		ticks = emergencyFundTicks(120000, 10000);
		expect(ticks[0].achieved).toBe(true);
		// £450 → 1mo + 3mo, not 6mo
		ticks = emergencyFundTicks(120000, 45000);
		expect(ticks.map((t) => t.achieved)).toEqual([true, true, false, false]);
	});

	it("returns no ticks for a zero target (undefined runway)", () => {
		expect(emergencyFundTicks(0, 5000)).toEqual([]);
	});
});

describe("debtTicks", () => {
	const ms = [
		{ label: "25% paid off", thresholdInCents: 7500, reachedAt: null },
		{ label: "Halfway there", thresholdInCents: 5000, reachedAt: null },
		{ label: "75% paid off", thresholdInCents: 2500, reachedAt: null },
		{ label: "Paid off", thresholdInCents: 0, reachedAt: null },
	];

	it("maps thresholds to paid-off fractions and sorts ascending", () => {
		const ticks = debtTicks(10000, 10000, ms);
		expect(ticks.map((t) => Math.round(t.pct))).toEqual([25, 50, 75, 100]);
		expect(ticks[0].label).toBe("25% paid off");
		expect(ticks[ticks.length - 1].label).toBe("Paid off");
	});

	it("achieved mirrors |balance| <= threshold (syncMilestones semantics)", () => {
		// £4,000 remaining on £10,000 start → 25% + Halfway reached
		const ticks = debtTicks(10000, 4000, ms);
		expect(ticks.map((t) => t.achieved)).toEqual([true, true, false, false]);
		// boundary: exactly £7,500 → 25% reached
		const boundary = debtTicks(10000, 7500, ms);
		expect(boundary[0].achieved).toBe(true);
	});

	it("respects a persisted reachedAt even if the balance regrew past it", () => {
		const pinned = [
			{ label: "Halfway there", thresholdInCents: 5000, reachedAt: new Date("2026-01-01") },
		];
		// balance back to £9,000 (> £5,000) — syncMilestones would un-reach,
		// but the DB flag still says reached until the sync writes; tick
		// must not contradict the record it renders next to.
		const ticks = debtTicks(10000, 9000, pinned);
		expect(ticks[0].achieved).toBe(true);
	});

	it("clamps out-of-range thresholds into the bar", () => {
		const weird = [{ label: "grew", thresholdInCents: 12000, reachedAt: null }];
		const ticks = debtTicks(10000, 11000, weird);
		expect(ticks[0].pct).toBe(0); // threshold above start → 0% position
		expect(ticks[0].achieved).toBe(true); // £11k remaining ≤ £12k threshold (trivially reached)
	});

	it("handles negative stored balances (liability sign) via abs", () => {
		const ticks = debtTicks(-10000, -4000, ms);
		expect(ticks.map((t) => Math.round(t.pct))).toEqual([25, 50, 75, 100]);
		expect(ticks[1].achieved).toBe(true);
	});

	it("returns no ticks for zero starting balance", () => {
		expect(debtTicks(0, 0, ms)).toEqual([]);
	});
});
