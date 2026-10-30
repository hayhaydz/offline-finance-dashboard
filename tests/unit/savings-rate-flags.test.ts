// tests/unit/savings-rate-flags.test.ts
//
// v3 sweep 9 (vision P1 on the savings-rate report): the worst-month row
// was flagged red regardless of value, contradicting the report's own
// legend ("≥20% green, 0–20% amber, negative red"). Flags now come from
// the threshold scale — rank lives in the label, colour in the scale.

import { describe, expect, it } from "vitest";
import { savingsRateFlag } from "../../src/lib/server/reports-v2";

describe("savingsRateFlag (threshold scale, not rank)", () => {
	it("the regression case: a 59.6% WORST month is green", () => {
		expect(savingsRateFlag(0.596)).toBe("green");
	});

	it("threshold boundaries", () => {
		expect(savingsRateFlag(0.2)).toBe("green");
		expect(savingsRateFlag(0.199)).toBe("amber");
		expect(savingsRateFlag(0)).toBe("amber");
		expect(savingsRateFlag(-0.001)).toBe("red");
		expect(savingsRateFlag(-0.5)).toBe("red");
	});

	it("a negative BEST month is red — green must not follow rank either", () => {
		expect(savingsRateFlag(-0.05)).toBe("red");
	});
});
