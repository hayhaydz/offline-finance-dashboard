import { describe, expect, it } from "vitest";
import {
	getAdditionalRateThresholdInCents,
	getHigherRateThresholdInCents,
} from "$lib/utils/tax-year-utils";

// v3.1 third mandate: vision caught the app carrying £150,000 forward as
// the additional-rate threshold — HMRC cut it to £125,140 from 2023/24.
// These pins keep the corrected ladder honest.
describe("HMRC band thresholds", () => {
	it("higher-rate threshold stays £50,270 across the freeze", () => {
		expect(getHigherRateThresholdInCents("2021-22")).toBe(50_270_00);
		expect(getHigherRateThresholdInCents("2026-27")).toBe(50_270_00);
	});

	it("additional rate is £150,000 through 2022/23 (last year)", () => {
		expect(getAdditionalRateThresholdInCents("2021-22")).toBe(150_000_00);
		expect(getAdditionalRateThresholdInCents("2022-23")).toBe(150_000_00);
	});

	it("additional rate is £125,140 from 2023/24 onward (HMRC cut, frozen)", () => {
		expect(getAdditionalRateThresholdInCents("2023-24")).toBe(125_140_00);
		expect(getAdditionalRateThresholdInCents("2024-25")).toBe(125_140_00);
		expect(getAdditionalRateThresholdInCents("2026-27")).toBe(125_140_00);
	});

	it("pre-2018 years inherit the earliest known values", () => {
		expect(getHigherRateThresholdInCents("2017-18")).toBe(46_350_00);
		expect(getAdditionalRateThresholdInCents("2017-18")).toBe(150_000_00);
	});
});
