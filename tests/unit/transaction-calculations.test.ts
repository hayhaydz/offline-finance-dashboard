import { describe, expect, it } from "vitest";
import {
	calculateProjectedInterestInCents,
	getTaxFreeStatus,
	getUkTaxYearBounds,
} from "$lib/utils/tax-year-utils";

describe("getUkTaxYearBounds", () => {
	it("returns current tax year when date is on/after 6 April", () => {
		const bounds = getUkTaxYearBounds(new Date("2026-04-06T12:00:00.000Z"));

		expect(bounds.start.toISOString()).toBe("2026-04-06T00:00:00.000Z");
		expect(bounds.end.toISOString()).toBe("2027-04-05T23:59:59.999Z");
	});

	it("returns previous tax year when date is before 6 April", () => {
		const bounds = getUkTaxYearBounds(new Date("2026-04-05T23:00:00.000Z"));

		expect(bounds.start.toISOString()).toBe("2025-04-06T00:00:00.000Z");
		expect(bounds.end.toISOString()).toBe("2026-04-05T23:59:59.999Z");
	});
});

describe("calculateProjectedInterestInCents", () => {
	it("projects simple pro-rated annual interest", () => {
		const result = calculateProjectedInterestInCents({
			balanceInCents: 10_000_00, // £10,000
			rateBasisPoints: 500, // 5.00%
			fromDate: new Date("2026-01-01T00:00:00.000Z"),
			toDate: new Date("2026-07-01T00:00:00.000Z"),
		});

		// Roughly half a year of 5% on £10,000 => ~£250
		expect(result).toBeGreaterThan(240_00);
		expect(result).toBeLessThan(260_00);
	});

	it("returns zero for non-positive balance, rate, or invalid range", () => {
		expect(
			calculateProjectedInterestInCents({
				balanceInCents: 0,
				rateBasisPoints: 500,
				toDate: new Date("2026-07-01T00:00:00.000Z"),
			}),
		).toBe(0);

		expect(
			calculateProjectedInterestInCents({
				balanceInCents: 10_000_00,
				rateBasisPoints: 0,
				toDate: new Date("2026-07-01T00:00:00.000Z"),
			}),
		).toBe(0);

		expect(
			calculateProjectedInterestInCents({
				balanceInCents: 10_000_00,
				rateBasisPoints: 500,
				fromDate: new Date("2026-07-02T00:00:00.000Z"),
				toDate: new Date("2026-07-01T00:00:00.000Z"),
			}),
		).toBe(0);
	});
});

describe("getTaxFreeStatus", () => {
	it("returns correct remaining allowance for basic tax band", () => {
		const result = getTaxFreeStatus(300_00, "basic");

		expect(result.allowance).toBe(1_000_00);
		expect(result.used).toBe(300_00);
		expect(result.remaining).toBe(700_00);
		expect(result.overAllowance).toBe(false);
		expect(result.taxableAmount).toBe(0);
	});

	it("flags over-allowance for higher tax band", () => {
		const result = getTaxFreeStatus(700_00, "higher");

		expect(result.allowance).toBe(500_00);
		expect(result.remaining).toBe(0);
		expect(result.overAllowance).toBe(true);
		expect(result.taxableAmount).toBe(200_00);
	});

	it("uses zero allowance for additional tax band", () => {
		const result = getTaxFreeStatus(1, "additional");

		expect(result.allowance).toBe(0);
		expect(result.overAllowance).toBe(true);
		expect(result.taxableAmount).toBe(1);
	});
});
