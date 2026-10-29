import { describe, expect, it } from "vitest";
import {
	BAND_RATE_PCT,
	compoundSeries,
	isaMoveTaxSavedPence,
	simulatePayoff,
	taxOnInterestPence,
	yearlyInterestPence,
	type CompoundPoint,
} from "$lib/utils/tool-math";
import { calculatePayoffProjection } from "$lib/server/debtMetrics";

// Phase 6 gate: every formula verified against HAND-COMPUTED examples,
// and simulatePayoff parity-tested against the server engine.

describe("yearlyInterestPence", () => {
	it("£10,000 at 4.55% → £455 (hand-computed)", () => {
		expect(yearlyInterestPence(1_000_000, 455)).toBe(45_500);
	});

	it("zero balance or zero rate → £0", () => {
		expect(yearlyInterestPence(0, 455)).toBe(0);
		expect(yearlyInterestPence(1_000_000, 0)).toBe(0);
	});

	it("rounds to whole pence (balance × bp / 10,000)", () => {
		// 123,457p × 321bp / 10000 = 3,962.9697p → 3,963
		expect(yearlyInterestPence(123_457, 321)).toBe(3_963);
	});
});

describe("taxOnInterestPence", () => {
	it("within allowance → £0 (hand: £400 vs £500 PSA)", () => {
		expect(taxOnInterestPence(40_000, 50_000, 40)).toBe(0);
	});

	it("over allowance → band rate on the excess (hand: £1,871.41 vs £500 at 40%)", () => {
		// (187,141 − 50,000) × 0.40 = 137,141 × 0.4 = 54,856.4 → 54,856
		expect(taxOnInterestPence(187_141, 50_000, 40)).toBe(54_856);
	});

	it("£0 allowance (additional rate) taxes everything at 45%", () => {
		// 20,000p × 0.45 = 9,000
		expect(taxOnInterestPence(20_000, 0, 45)).toBe(9_000);
	});
});

describe("isaMoveTaxSavedPence", () => {
	it("moving £10,000 at 4.55% removes £455 of taxable interest (hand-computed)", () => {
		// before: (187,141 − 50,000) × 0.4 = 54,856
		// after:  (187,141 − 45,500 − 50,000) × 0.4 = 91,641 × 0.4 = 36,656.4 → 36,656
		// saved: 54,856 − 36,656 = 18,200 (= 45,500 × 0.4 — fully over allowance)
		const saved = isaMoveTaxSavedPence({
			principalMovedPence: 1_000_000,
			rateBasisPoints: 455,
			taxableInterestPence: 187_141,
			allowancePence: 50_000,
			bandRatePct: 40,
		});
		expect(saved).toBe(18_200);
	});

	it("£0 saved when the move stays within the allowance anyway", () => {
		// taxable £300 vs £500 PSA → tax 0 before AND after
		expect(
			isaMoveTaxSavedPence({
				principalMovedPence: 100_000,
				rateBasisPoints: 500,
				taxableInterestPence: 30_000,
				allowancePence: 50_000,
				bandRatePct: 40,
			}),
		).toBe(0);
	});
});

describe("BAND_RATE_PCT", () => {
	it("matches HMRC savings-interest band rates", () => {
		expect(BAND_RATE_PCT.basic).toBe(20);
		expect(BAND_RATE_PCT.higher).toBe(40);
		expect(BAND_RATE_PCT.additional).toBe(45);
	});
});

describe("simulatePayoff — parity with the server engine", () => {
	const cases: Array<{
		name: string;
		balanceInCents: number;
		aprBasisPoints: number | null;
		monthlyPaymentInCents: number;
	}> = [
		{ name: "£2,000 @ 18.9% paying £100", balanceInCents: 200_000, aprBasisPoints: 1890, monthlyPaymentInCents: 10_000 },
		{ name: "£10,000 @ 0% paying £250", balanceInCents: 1_000_000, aprBasisPoints: null, monthlyPaymentInCents: 25_000 },
		{ name: "£500 @ 2.49% paying £50", balanceInCents: 50_000, aprBasisPoints: 249, monthlyPaymentInCents: 5_000 },
		{ name: "payment below interest", balanceInCents: 200_000, aprBasisPoints: 1890, monthlyPaymentInCents: 3_000 },
		{ name: "zero balance", balanceInCents: 0, aprBasisPoints: 1890, monthlyPaymentInCents: 10_000 },
		{ name: "zero payment", balanceInCents: 200_000, aprBasisPoints: 1890, monthlyPaymentInCents: 0 },
	];

	for (const c of cases) {
		it(`matches calculatePayoffProjection: ${c.name}`, () => {
			const engine = calculatePayoffProjection({
				balanceInCents: c.balanceInCents,
				aprBasisPoints: c.aprBasisPoints,
				monthlyPaymentInCents: c.monthlyPaymentInCents,
			});
			const mine = simulatePayoff({
				balanceInCents: c.balanceInCents,
				aprBasisPoints: c.aprBasisPoints,
				monthlyPaymentInCents: c.monthlyPaymentInCents,
			});
			expect(mine.months).toBe(engine.months);
			expect(mine.totalInterestInCents).toBe(engine.totalInterestInCents);
		});
	}

	it("hand-check: £2,000 @ 18.9% paying £100 → 25 months, £500 interest", () => {
		// monthly r = 0.01575; N = -ln(1 − 0.01575×200000/10000)/ln(1.01575)
		//           = -ln(0.685)/0.0156268 = 0.378336/0.0156268 = 24.21 → 25 months
		// interest = 25 × £100 − £2,000 = £500
		const out = simulatePayoff({
			balanceInCents: 200_000,
			aprBasisPoints: 1890,
			monthlyPaymentInCents: 10_000,
		});
		expect(out.months).toBe(25);
		expect(out.totalInterestInCents).toBe(50_000);
	});

	it("overpayment shortens the payoff: +£50/mo on the hand-check case", () => {
		const base = simulatePayoff({
			balanceInCents: 200_000,
			aprBasisPoints: 1890,
			monthlyPaymentInCents: 10_000,
		});
		const extra = simulatePayoff({
			balanceInCents: 200_000,
			aprBasisPoints: 1890,
			monthlyPaymentInCents: 15_000,
		});
		expect(extra.months).not.toBeNull();
		expect(extra.months!).toBeLessThan(base.months!);
		expect(extra.totalInterestInCents!).toBeLessThan(base.totalInterestInCents!);
	});
});

describe("compoundSeries", () => {
	it("year-0 point is the principal untouched", () => {
		const [p0] = compoundSeries({
			principalPence: 100_000,
			monthlyPence: 10_000,
			rateBasisPoints: 500,
			years: 1,
		});
		expect(p0).toEqual({
			year: 0,
			balancePence: 100_000,
			contributedPence: 100_000,
			interestPence: 0,
		});
	});

	it("hand-check 1y: £1,000 + £100/mo at 5% → ≈ £2,279", () => {
		// A = P(1+r/12)^12 + PMT × ((1+r/12)^12 − 1)/(r/12)
		//   = 1000×1.05116 + 100×(0.05116/0.0041667) = 1051.16 + 1227.89 = 2279.05
		const pts = compoundSeries({
			principalPence: 100_000,
			monthlyPence: 10_000,
			rateBasisPoints: 500,
			years: 1,
		});
		expect(pts.length).toBe(2); // year 0 + year 1
		expect(pts[1].balancePence).toBeGreaterThanOrEqual(227_800);
		expect(pts[1].balancePence).toBeLessThanOrEqual(227_950);
		expect(pts[1].contributedPence).toBe(220_000); // £1,000 + 12×£100
		// interest = balance − contributed ≈ £79.05
		expect(pts[1].interestPence).toBeGreaterThanOrEqual(7_800);
		expect(pts[1].interestPence).toBeLessThanOrEqual(7_950);
	});

	it("0% rate → balance = contributions exactly", () => {
		const pts = compoundSeries({
			principalPence: 50_000,
			monthlyPence: 10_000,
			rateBasisPoints: 0,
			years: 2,
		});
		expect(pts[2].balancePence).toBe(290_000); // 50k + 24×10k
		expect(pts[2].interestPence).toBe(0);
	});

	it("samples one point per whole year", () => {
		const pts = compoundSeries({
			principalPence: 100_000,
			monthlyPence: 0,
			rateBasisPoints: 300,
			years: 5,
		});
		expect(pts.map((p) => p.year)).toEqual([0, 1, 2, 3, 4, 5]);
	});
});

// Phase 9 cycle 9: typed inputs bypass HTML min/max — the math layer must
// be total (no NaN into SVG paths, no negative balances, no runaway loops).
describe("compoundSeries input hardening", () => {
	const allFinite = (pts: CompoundPoint[]) =>
		pts.every(
			(p) =>
				Number.isFinite(p.balancePence) &&
				Number.isFinite(p.contributedPence) &&
				Number.isFinite(p.interestPence),
		);

	it("clamps typed negative principal/monthly to 0", () => {
		const pts = compoundSeries({
			principalPence: -50_000,
			monthlyPence: -100,
			rateBasisPoints: 300,
			years: 2,
		});
		expect(pts[0].balancePence).toBe(0);
		expect(pts.every((p) => p.balancePence >= 0)).toBe(true);
		expect(allFinite(pts)).toBe(true);
	});

	it("NaN inputs (cleared number fields) degrade to a flat zero projection, never NaN", () => {
		const pts = compoundSeries({
			principalPence: NaN,
			monthlyPence: NaN,
			rateBasisPoints: NaN,
			years: NaN,
		});
		expect(pts).toHaveLength(1);
		expect(pts[0].balancePence).toBe(0);
		expect(allFinite(pts)).toBe(true);
	});

	it("caps rate at 15% and years at 40 regardless of typed values", () => {
		const pts = compoundSeries({
			principalPence: 100_000,
			monthlyPence: 0,
			rateBasisPoints: 5000, // typed 50%
			years: 10_000, // typed 10000 years
		});
		// 40 years + the start point, and no more
		expect(pts).toHaveLength(41);
		// rate capped at 15%: monthly-compounded 40y growth of £1,000
		// ≈ £388.7k; the uncapped 50% input would give ≈ £32.5 billion
		expect(pts[40].balancePence).toBeLessThan(40_000_000);
		expect(allFinite(pts)).toBe(true);
	});

	it("yearlyInterestPence returns 0 for non-finite inputs", () => {
		expect(yearlyInterestPence(NaN, 455)).toBe(0);
		expect(yearlyInterestPence(1_000_000, Infinity)).toBe(0);
	});
});
