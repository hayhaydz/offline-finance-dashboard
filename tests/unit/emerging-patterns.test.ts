// tests/unit/emerging-patterns.test.ts
//
// v3 R-H15: the bills watchlist — exactly-two-occurrence groups with a
// monthly cadence and consistent amounts. Hand-computed fixtures.

import { describe, expect, it } from "vitest";
import { detectEmergingPatterns } from "../../src/lib/server/recurring-patterns";

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const tx = (desc: string, pence: number, iso: string) => ({
	description: desc,
	amount: -pence,
	transactionDate: d(iso),
});

describe("detectEmergingPatterns (R-H15)", () => {
	it("two similar withdrawals a month apart emerge", () => {
		const out = detectEmergingPatterns([
			tx("Spotify", 999, "2026-09-05"),
			tx("Spotify", 999, "2026-10-05"),
		]);
		expect(out).toHaveLength(1);
		expect(out[0].description).toBe("Spotify");
		expect(out[0].approximateAmount).toBe(999);
		expect(out[0].firstDate).toEqual(d("2026-09-05"));
		expect(out[0].lastDate).toEqual(d("2026-10-05"));
	});

	it("three occurrences is a CONFIRMED pattern, not emerging", () => {
		const out = detectEmergingPatterns([
			tx("Rent", 95000, "2026-08-01"),
			tx("Rent", 95000, "2026-09-01"),
			tx("Rent", 95000, "2026-10-01"),
		]);
		expect(out).toHaveLength(0);
	});

	it("cadence outside 28–35 days never emerges", () => {
		expect(
			detectEmergingPatterns([tx("A", 500, "2026-09-01"), tx("A", 500, "2026-09-11")]),
		).toHaveLength(0); // 10d
		expect(
			detectEmergingPatterns([tx("B", 500, "2026-09-01"), tx("B", 500, "2026-11-15")]),
		).toHaveLength(0); // 75d
	});

	it("amounts beyond ±10% of the pair mean are rejected", () => {
		expect(
			detectEmergingPatterns([tx("Club Fee", 2000, "2026-09-01"), tx("Club Fee", 2600, "2026-10-01")]),
		).toHaveLength(0);
		// ±10% boundary: 2000 vs 2200 (mean 2100, hi 2200 ≤ 2310) passes
		expect(
			detectEmergingPatterns([tx("Gym Pass", 2000, "2026-09-01"), tx("Gym Pass", 2200, "2026-10-01")]),
		).toHaveLength(1);
	});

	it("mixed groups: only the exactly-two group emerges, newest first", () => {
		const out = detectEmergingPatterns([
			tx("Big", 1000, "2026-06-01"),
			tx("Big", 1000, "2026-07-01"),
			tx("Big", 1000, "2026-08-01"),
			tx("Big", 1000, "2026-09-01"),
			tx("Old2", 300, "2026-07-10"),
			tx("Old2", 300, "2026-08-09"),
			tx("New2", 700, "2026-09-20"),
			tx("New2", 700, "2026-10-20"),
		]);
		expect(out.map((p) => p.description)).toEqual(["New2", "Old2"]);
	});

	it("short descriptions (<4 chars) and null descriptions are skipped", () => {
		const out = detectEmergingPatterns([
			{ description: null, amount: -500, transactionDate: d("2026-09-01") },
			{ description: null, amount: -500, transactionDate: d("2026-10-01") },
			tx("ab", 500, "2026-09-01"),
			tx("ab", 500, "2026-10-01"),
		]);
		expect(out).toHaveLength(0);
	});
});
