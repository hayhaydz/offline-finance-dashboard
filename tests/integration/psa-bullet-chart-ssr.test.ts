import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { ComponentProps } from "svelte";
import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";

// Phase 5 line 2: PSA bullet chart — actual vs projected taxable interest
// against the band-aware personal savings allowance.

const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

const renderBullet = (props: Partial<ComponentProps<typeof PsaBulletChart>>) => {
	const defaults: ComponentProps<typeof PsaBulletChart> = {
		taxYearLabel: "2026/27",
		band: "basic",
		allowancePence: 100000,
		actualPence: 0,
		projectedPence: 0,
		formatPence: fmt,
	};
	return render(PsaBulletChart, { props: { ...defaults, ...props } });
};

describe("PsaBulletChart (Phase 5 line 2)", () => {
	it("renders allowance zone, measure, projected extension, and marker", () => {
		const { body } = renderBullet({
			allowancePence: 100000,
			actualPence: 60000,
			projectedPence: 30000,
		});
		expect(body).toContain("Personal savings allowance");
		expect(body).toContain("psa-over-hatch");
		expect(body).toContain("PSA £1000.00"); // stub formatter (live uses formatCurrency)
		expect(body).toMatch(/Projected additional taxable £300\.00/);
		expect(body).toContain("forecast £900.00");
	});

	it("turns the over-allowance portion of the measure red + says OVER", () => {
		const { body } = renderBullet({
			allowancePence: 50000,
			actualPence: 70000,
			projectedPence: 0,
		});
		expect(body).toContain('fill="var(--chart-neg)"');
		expect(body).toContain("OVER allowance by £200.00");
	});

	it("handles the additional-rate £0 allowance (no marker, explicit note)", () => {
		const { body } = renderBullet({
			band: "additional",
			allowancePence: 0,
			actualPence: 4000,
			projectedPence: 0,
		});
		expect(body).toContain("no tax-free interest allowance");
		expect(body).not.toContain("PSA £0.00");
	});

	it("is a print-safe viewBox SVG with role=img", () => {
		const { body } = renderBullet({
			allowancePence: 100000,
			actualPence: 60000,
			projectedPence: 30000,
		});
		expect(body).toMatch(/viewBox="0 0 600 120"/);
		expect(body).toContain('role="img"');
	});
});
