import { describe, expect, it } from "vitest";
import {
	HISTORY_RANGES,
	rangeLabel,
	sliceNetWorthRange,
} from "$lib/utils/report-ranges";

// Phase 5 line 1: deterministic range slicing anchored at the newest point.

const mk = (iso: string, v = 0) => ({ date: iso, netWorthInCents: v });

// six years of June snapshots: 2020-06 .. 2025-06 (yearly cadence)
const sixYears = Array.from({ length: 6 }, (_, i) => mk(`202${i}-06-15`, i * 100));

describe("sliceNetWorthRange", () => {
	it("all returns the input unchanged", () => {
		expect(sliceNetWorthRange(sixYears, "all")).toBe(sixYears);
	});

	it("1y keeps only points within 365d of the newest point", () => {
		const out = sliceNetWorthRange(sixYears, "1y");
		// yearly cadence: 2024-06-15 is exactly 365d before the newest point
		expect(out.map((p) => p.date)).toEqual(["2024-06-15", "2025-06-15"]);
	});

	it("5y keeps the trailing five years (cuts the sixth)", () => {
		const out = sliceNetWorthRange(sixYears, "5y");
		expect(out.map((p) => p.date)).toEqual([
			"2021-06-15",
			"2022-06-15",
			"2023-06-15",
			"2024-06-15",
			"2025-06-15",
		]);
	});

	it("keeps a boundary point exactly at the cutoff (>=)", () => {
		const pts = [mk("2024-06-15"), mk("2025-06-15")];
		// 2024-06-15 is exactly 365d before 2025-06-15
		expect(sliceNetWorthRange(pts, "1y").map((p) => p.date)).toEqual([
			"2024-06-15",
			"2025-06-15",
		]);
	});

	it("never returns an empty slice", () => {
		const old = [mk("1990-01-01")];
		expect(sliceNetWorthRange(old, "1y")).toEqual(old);
		expect(sliceNetWorthRange([], "1y")).toEqual([]);
	});

	it("exposes the three ranges in display order", () => {
		expect(HISTORY_RANGES).toEqual(["1y", "5y", "all"]);
	});
});

describe("rangeLabel", () => {
	it("labels each range", () => {
		expect(rangeLabel("1y")).toBe("last 12 months");
		expect(rangeLabel("5y")).toBe("last 5 years");
		expect(rangeLabel("all")).toBe("all time");
	});
});
