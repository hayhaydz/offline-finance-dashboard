// tests/unit/seasonality.test.ts
//
// v3 R-H18: net-worth seasonality math — consecutive monthly deltas
// grouped by ending calendar month. Hand-computed fixtures (two years of
// monthly snapshots — repeat observations need ≥13 months by design).

import { describe, expect, it } from "vitest";
import { seasonalityFromHistory } from "../../src/lib/server/reports-v2";

const snap = (iso: string, pence: number) => ({ date: iso, netWorthInCents: pence });

/** Build monthly snapshots from per-step deltas (pence), starting
 *  2024-11-01. delta[i] is the change ENDING in month i+1. */
function buildFromDeltas(deltas: number[], startYear = 2024, startMonth = 11): {
	date: string;
	netWorthInCents: number;
}[] {
	const out = [snap(`${startYear}-${String(startMonth).padStart(2, "0")}-01`, 1_000_000)];
	let value = 1_000_000;
	let y = startYear;
	let m = startMonth;
	for (const d of deltas) {
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
		value += d;
		out.push(snap(`${y}-${String(m).padStart(2, "0")}-01`, value));
	}
	return out;
}

// 25 steps: 2024-11 → 2026-11. Every calendar month ends a step at least
// twice except the very last one.
const D = (oct: number, nov: number, dec: number, jan: number, other: number) => ({
	oct,
	nov,
	dec,
	jan,
	other,
});
const season = (year: { oct: number; nov: number; dec: number; jan: number; other: number }) => [
	year.other, // Feb end
	year.other, // Mar
	year.other, // Apr
	year.other, // May
	year.other, // Jun
	year.other, // Jul
	year.other, // Aug
	year.other, // Sep
	year.oct, // Oct
	year.nov, // Nov
	year.dec, // Dec
	year.jan, // Jan (next year)
];

const y1 = D(50_000, -70_000, -80_000, 70_000, 10_000);
const y2 = D(60_000, -90_000, -60_000, 50_000, 20_000);
// anchor Jan 2025: first step ends Feb … season() order matches
const full = buildFromDeltas([...season(y1), ...season(y2)], 2025, 1);

describe("seasonalityFromHistory (R-H18)", () => {
	it("groups consecutive-month deltas by ending calendar month with means", () => {
		const r = seasonalityFromHistory(full);
		expect(r.status).toBe("ok");
		const oct = r.months.find((m) => m.monthOfYear === 9);
		expect(oct).toBeDefined();
		// Oct ends: +50k (2025) and +60k (2026) → mean +55k
		expect(oct!.meanDeltaPence).toBe(55_000);
		expect(oct!.samples).toBe(2);
		const other = r.months.find((m) => m.monthOfYear === 3); // Apr
		expect(other!.meanDeltaPence).toBe(15_000); // 10k and 20k
	});

	it("weakest and strongest by mean (Nov worst, Jan best)", () => {
		const r = seasonalityFromHistory(full);
		expect(r.weakest!.monthOfYear).toBe(10); // Nov mean -80,000
		expect(r.weakest!.meanDeltaPence).toBe(-80_000);
		expect(r.strongest!.monthOfYear).toBe(0); // Jan mean +60,000
		expect(r.strongest!.meanDeltaPence).toBe(60_000);
	});

	it("all 12 months report with two full seasons", () => {
		const r = seasonalityFromHistory(full);
		expect(r.months).toHaveLength(12);
	});

	it("gaps outside 25–40 days break the chain", () => {
		const r = seasonalityFromHistory([
			snap("2025-01-01", 100_000),
			snap("2025-02-01", 110_000), // step ✓
			snap("2025-09-01", 200_000), // 7-month gap — excluded
			snap("2025-10-01", 210_000), // step ✓
		]);
		expect(r.steps).toBe(2);
	});

	it("fewer than 13 snapshots → too-little (honest degrade)", () => {
		const r = seasonalityFromHistory(full.slice(0, 12));
		expect(r.status).toBe("too-little");
		expect(r.weakest).toBeNull();
	});
});
