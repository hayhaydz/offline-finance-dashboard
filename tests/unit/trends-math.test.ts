import { describe, expect, it } from "vitest";
import {
	averageOfLast,
	cumulativeSpendByDay,
	daysInMonthKey,
	estimateEndBalance,
	flowsByMonth,
	prevMonthKey,
	savedOrLostPence,
	targetPaceByDay,
} from "$lib/utils/trends-math";

// v3.2 A14/V6: pins for the trends projection math. All values are pence.
// Statement model (D0): averages derive from DECLARED months only; the
// estimated end balance fills only the un-declared remainder of a month.

describe("cumulativeSpendByDay", () => {
	it("accumulates outflows and carries gap days forward", () => {
		const series = cumulativeSpendByDay(
			[
				{ day: 1, amountPence: -1000 },
				{ day: 3, amountPence: -500 },
				{ day: 3, amountPence: -200 },
				{ day: 5, amountPence: 900 }, // inflow — NOT spend
			],
			5,
		);
		expect(series).toEqual([1000, 1000, 1700, 1700, 1700]);
	});

	it("clamps out-of-range days and returns zeros for an empty month", () => {
		expect(cumulativeSpendByDay([{ day: 32, amountPence: -100 }], 31)[30]).toBe(0);
		expect(cumulativeSpendByDay([], 4)).toEqual([0, 0, 0, 0]);
	});
});

describe("flowsByMonth", () => {
	it("splits in/out by sign per declared month, sorted oldest first", () => {
		const flows = flowsByMonth([
			{ monthKey: "2026-10", amountPence: -300 },
			{ monthKey: "2026-09", amountPence: 1000 },
			{ monthKey: "2026-10", amountPence: 250 },
		]);
		expect(flows).toEqual([
			{ monthKey: "2026-09", moneyInPence: 1000, moneyOutPence: 0 },
			{ monthKey: "2026-10", moneyInPence: 250, moneyOutPence: 300 },
		]);
	});
});

describe("averageOfLast (declared-history projection)", () => {
	it("means the last N declared values only", () => {
		expect(averageOfLast([100, 200, 300, 400], 3)).toBe(300);
		expect(averageOfLast([100], 3)).toBe(100);
	});

	it("is null with no history (honest degrade)", () => {
		expect(averageOfLast([], 3)).toBeNull();
	});
});

describe("estimateEndBalance", () => {
	it("fills the un-declared remainder from averages", () => {
		// start £10k, declared in £500/out £600; averages say a full month is
		// in £700/out £1,200 → projected end = 10000 + 700 − 1200 = £9,500
		expect(
			estimateEndBalance({
				startingBalancePence: 1_000_000,
				declaredInPence: 50_000,
				declaredOutPence: 60_000,
				avgInPence: 70_000,
				avgOutPence: 120_000,
			}),
		).toBe(950_000);
	});

	it("trusts declared figures once they exceed the averages", () => {
		// declared out £2k already beats avg £1.2k → no down-projection
		expect(
			estimateEndBalance({
				startingBalancePence: 500_000,
				declaredInPence: 0,
				declaredOutPence: 200_000,
				avgInPence: 50_000,
				avgOutPence: 120_000,
			}),
		).toBe(350_000);
	});

	it("returns null when nothing has ever been declared", () => {
		expect(
			estimateEndBalance({
				startingBalancePence: 100,
				declaredInPence: 0,
				declaredOutPence: 0,
				avgInPence: null,
				avgOutPence: null,
			}),
		).toBeNull();
	});
});

describe("target pace + verdict", () => {
	it("draws the diagonal from 0 to the full target", () => {
		const pace = targetPaceByDay(3100, 31);
		expect(pace[0]).toBe(100); // day 1 = 3100/31
		expect(pace[30]).toBe(3100); // day 31 = the target
	});

	it("saved is positive under target, negative over", () => {
		expect(savedOrLostPence(1000, 700)).toBe(300);
		expect(savedOrLostPence(1000, 1400)).toBe(-400);
	});
});

describe("month helpers", () => {
	it("crosses the year boundary backwards", () => {
		expect(prevMonthKey("2026-01")).toBe("2025-12");
		expect(prevMonthKey("2026-11")).toBe("2026-10");
	});

	it("knows month lengths including leap February", () => {
		expect(daysInMonthKey("2026-02")).toBe(28);
		expect(daysInMonthKey("2028-02")).toBe(29);
		expect(daysInMonthKey("2026-10")).toBe(31);
	});
});
