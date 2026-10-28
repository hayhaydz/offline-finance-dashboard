import { describe, expect, it } from "vitest";
import {
	allocationShares,
	heatLevel,
	monthGrid,
	projectObligations,
	rateAtMonthStart,
	recentMonthStarts,
} from "$lib/utils/surface-views";

// Phase 7 line 2: rate heatmap / allocation / cashflow calendar shaping.

const d = (s: string) => new Date(s);

describe("rateAtMonthStart", () => {
	const rates = [
		{ rate: 100, effectiveFrom: d("2026-01-01") },
		{ rate: 450, effectiveFrom: d("2026-06-15") },
		{ rate: 500, effectiveFrom: d("2026-09-01") },
	];

	it("uses the latest effective row at or before the month start", () => {
		expect(rateAtMonthStart(rates, d("2026-07-01"))).toBe(450);
		expect(rateAtMonthStart(rates, d("2026-10-01"))).toBe(500);
	});

	it("returns null before any rate existed", () => {
		expect(rateAtMonthStart(rates, d("2025-12-01"))).toBeNull();
	});

	it("ignores future-dated rows", () => {
		expect(rateAtMonthStart(rates, d("2026-02-01"))).toBe(100);
	});
});

describe("recentMonthStarts", () => {
	it("returns count month starts, oldest first, current inclusive", () => {
		const out = recentMonthStarts(4, d("2026-10-15"));
		expect(out.map((x) => x.toISOString().slice(0, 7))).toEqual([
			"2026-07",
			"2026-08",
			"2026-09",
			"2026-10",
		]);
	});
});

describe("heatLevel", () => {
	it("maps min→0 and max→4 across the range", () => {
		expect(heatLevel(0, 0, 500)).toBe(0);
		expect(heatLevel(100, 0, 500)).toBe(1); // 20% → floor(0.2*5)=1
		expect(heatLevel(250, 0, 500)).toBe(2);
		expect(heatLevel(499, 0, 500)).toBe(4);
		expect(heatLevel(500, 0, 500)).toBe(4);
	});

	it("flat range falls back to mid level", () => {
		expect(heatLevel(300, 300, 300)).toBe(2);
	});

	it("clamps out-of-range values", () => {
		expect(heatLevel(-50, 0, 500)).toBe(0);
		expect(heatLevel(999, 0, 500)).toBe(4);
	});
});

describe("allocationShares", () => {
	it("sorts by value desc and sums to exactly 100%", () => {
		const shares = allocationShares([
			{ name: "a", value: 50 },
			{ name: "b", value: 30 },
			{ name: "c", value: 20 },
		]);
		expect(shares.map((s) => s.name)).toEqual(["a", "b", "c"]);
		expect(shares.map((s) => s.percent)).toEqual([50, 30, 20]);
		expect(shares.reduce((s, x) => s + x.percent, 0)).toBe(100);
	});

	it("absorbs rounding drift so percentages sum to 100", () => {
		const shares = allocationShares([
			{ name: "a", value: 1 },
			{ name: "b", value: 1 },
			{ name: "c", value: 1 },
		]);
		expect(shares.reduce((s, x) => s + x.percent, 0)).toBe(100);
	});

	it("drops zero/negative values and returns [] for empty totals", () => {
		expect(allocationShares([{ name: "a", value: 0 }])).toEqual([]);
		expect(allocationShares([{ name: "a", value: -5 }])).toEqual([]);
	});
});

describe("projectObligations", () => {
	it("projects monthly from the last occurrence into the horizon", () => {
		const out = projectObligations(
			[{ description: "Rent", approximateAmount: -95000, lastDate: d("2026-10-01") }],
			d("2026-10-28"),
			31,
		);
		// next: 2026-10-31 (30d after); 11-30 falls beyond the 11-28 horizon
		expect(out.map((o) => o.date)).toEqual(["2026-10-31"]);
		expect(out[0].description).toBe("Rent");
	});

	it("skips past occurrences and respects the horizon", () => {
		const out = projectObligations(
			[{ description: "Gym", approximateAmount: -2500, lastDate: d("2026-08-15") }],
			d("2026-10-28"),
			10,
		);
		// next due 2026-09-14 (past) → 2026-10-14 (past) → 2026-11-13 (beyond 11-07)
		expect(out).toEqual([]);
	});

	it("sorts by date across patterns", () => {
		const out = projectObligations(
			[
				{ description: "B", approximateAmount: -100, lastDate: d("2026-10-20") },
				{ description: "A", approximateAmount: -200, lastDate: d("2026-10-01") },
			],
			d("2026-10-28"),
			31,
		);
		expect(out.map((o) => o.description)).toEqual(["A", "B"]);
	});
});

describe("monthGrid", () => {
	it("builds Monday-first weeks with leading blanks for the offset", () => {
		// 2026-10-01 is a Thursday → offset 3 (Mon/Tue/Wed blank)
		const weeks = monthGrid(2026, 10, []);
		expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
		expect(weeks[0][3]).toEqual({ day: 1, items: [] });
	});

	it("places obligations on their days", () => {
		const obs = [{ date: "2026-10-05", description: "Rent", amountPence: -95000 }];
		const weeks = monthGrid(2026, 10, obs);
		const all = weeks.flat();
		expect(all.find((c) => c?.day === 5)?.items).toHaveLength(1);
	});

	it("covers every day of the month exactly once", () => {
		const days = monthGrid(2026, 10, [])
			.flat()
			.filter((c): c is { day: number; items: never[] } => c !== null)
			.map((c) => c.day);
		expect(days).toHaveLength(31);
		expect(days[0]).toBe(1);
		expect(days[30]).toBe(31);
	});
});
