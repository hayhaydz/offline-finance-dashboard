import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import TaxYearTimeline from "$lib/components/TaxYearTimeline.svelte";

// v3.1 A02 / doctrine D3: the tax-year timeline strip — 12 real month
// cells (elapsed shaded, current partially filled + TODAY marker), ISA
// allowance + pacing in a second lane. The full-width replacement for the
// 3/2 TaxYear|ISA pair whose short bar sat centered in a tall cell.

const base = {
	used: 4_000_00,
	limit: 20_000_00,
	remaining: 16_000_00,
	taxYearStart: new Date("2026-04-06T00:00:00Z"),
	taxYearEnd: new Date("2027-04-05T00:00:00Z"),
};

describe("TaxYearTimeline (A02 D3 rebuild)", () => {
	it("renders 12 month cells starting at the tax-year month (APR..MAR)", () => {
		const { body } = render(TaxYearTimeline, { props: { data: base } });
		expect((body.match(/title="([A-Z]{3}) —/g) ?? []).length).toBe(12);
		expect(body).toContain(">APR<");
		expect(body).toContain(">MAR<");
	});

	it("marks exactly one month as TODAY with a partial fill", () => {
		const { body } = render(TaxYearTimeline, { props: { data: base } });
		expect((body.match(/TODAY/g) ?? []).length).toBe(1);
		// partial fill: a width between 1% and 99% on the current cell
		expect(body).toMatch(/width: (?:[1-9]|[1-8][0-9]|9[0-8])\.?\d*%/);
	});

	it("header states day counter, days remaining, end date, and the ISA link", () => {
		const { body } = render(TaxYearTimeline, { props: { data: base } });
		expect(body).toContain("TAX YEAR: 2026/27");
		expect(body).toMatch(/Day \d+ of 365/);
		expect(body).toMatch(/\d+ days remaining/);
		expect(body).toContain("ends 5 Apr 2027");
		expect(body).toContain('href="/accounts/isa/2026-27"');
	});

	it("ISA lane carries usage, remaining, and pacing verdict", () => {
		const { body } = render(TaxYearTimeline, {
			props: {
				data: {
					...base,
					pacing: {
						status: "on-track",
						monthsElapsed: 7,
						monthsRemaining: 5,
						actualMonthlyAvgInCents: 2_000_00,
						requiredMonthlyInCents: 1_904_76,
						allowanceUsedInCents: base.used,
						allowanceRemainingInCents: base.remaining,
						daysRemainingInTaxYear: 156,
						taxYearLabel: "2026-27",
						isLastMonth: false,
					},
				},
			},
		});
		expect(body).toContain("ISA ALLOWANCE");
		expect(body).toContain("£4k / £20k used");
		expect(body).toContain("£16,000.00 remaining");
		expect(body).toContain("ON TRACK");
		expect(body).toContain("avg £2k/mo");
	});
});
