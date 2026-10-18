import { describe, expect, it } from "vitest";
import {
	calculateTTZ,
	getProjectionNullReason,
} from "$lib/utils/debt-calculator";

describe("liabilities TTZ display", () => {
	it("treats months === 0 as pays off this month (zero balance)", () => {
		const result = calculateTTZ(0, 2290, { type: "flat", flat: 5000 });
		expect(result.months).toBe(0);
		expect(result.years).toBe(0);
		expect(getProjectionNullReason(result.months, { type: "flat", flat: 5000 })).toBeNull();
	});

	it("reports no_minimum_payment when projection is null and no rule is configured", () => {
		expect(
			getProjectionNullReason(null, { type: null, flat: null, percentage: null }),
		).toBe("no_minimum_payment");
		expect(
			getProjectionNullReason(null, { type: "flat", flat: null, percentage: null }),
		).toBe("no_minimum_payment");
		expect(
			getProjectionNullReason(null, { type: "percentage", flat: null, percentage: null }),
		).toBe("no_minimum_payment");
	});

	it("reports payment_below_interest when a rule is set but projection is null", () => {
		// £1000 balance at 22.9% APR ≈ £1.91/month interest; £1 payment never clears it
		const result = calculateTTZ(100000, 2290, { type: "flat", flat: 100 });
		expect(result.months).toBeNull();
		expect(
			getProjectionNullReason(result.months, { type: "flat", flat: 100 }),
		).toBe("payment_below_interest");
		expect(
			getProjectionNullReason(null, { type: "percentage", flat: null, percentage: 100 }),
		).toBe("payment_below_interest");
	});

	it("returns null reason whenever a projection exists", () => {
		const result = calculateTTZ(100000, 2290, { type: "flat", flat: 10000 });
		expect(result.months).not.toBeNull();
		expect(
			getProjectionNullReason(result.months, { type: "flat", flat: 10000 }),
		).toBeNull();
	});
});
