import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import BurnDownChart from "$lib/components/charts/BurnDownChart.svelte";

// Phase 4 V1 #2: budget burn-down — spend curve vs dashed even-pace line
// with a today marker, inside a ChartPanel with a text summary.

const points = [
	{ day: 1, cumulativePence: 0 },
	{ day: 2, cumulativePence: 4500 },
	{ day: 3, cumulativePence: 6200 },
	{ day: 4, cumulativePence: 9100 },
	{ day: 5, cumulativePence: 9800 },
];

const renderChart = () =>
	render(BurnDownChart, {
		props: {
			points,
			totalDays: 31,
			targetPence: 150000,
			todayDay: 5,
			spendLabel: (p: number) => `£${(p / 100).toFixed(2)}`,
		},
	});

describe("BurnDownChart (Phase 4 V1 #2)", () => {
	it("renders the ChartPanel frame with title and text summary", () => {
		const { body } = renderChart();
		expect(body).toContain("Spend burn-down");
		expect(body).toContain("£98.00 spent of £1500.00 target"); // stub label; live page uses formatCurrency
		expect(body).toContain("day 5 of 31");
	});

	it("draws the spend polyline, dashed pace line, and today marker", () => {
		const { body } = renderChart();
		expect(body).toContain("<polyline");
		expect(body).toContain("chart-dashed"); // pace line + today line
		expect(body).toContain("<rect"); // square marker on today
	});

	it("is a print-safe viewBox SVG with an accessible label", () => {
		const { body } = renderChart();
		expect(body).toMatch(/viewBox="0 0 600 200"/);
		expect(body).toContain('role="img"');
		expect(body).toContain("aria-label");
	});

	it("renders the line legend (final-audit P1: lines indistinguishable)", () => {
		const { body } = renderChart();
		expect(body).toContain("actual spend");
		expect(body).toContain("even pace");
		expect(body).toContain("today");
		expect(body).toContain("target");
	});

	it("axis labels show zero, the y-max, and day range", () => {
		const { body } = renderChart();
		expect(body).toContain(">£0<");
		expect(body).toContain(">d1<");
		expect(body).toContain(">d31<");
	});
});
