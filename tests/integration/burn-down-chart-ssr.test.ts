import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import BurnDownChart from "$lib/components/charts/BurnDownChart.svelte";

// A13 layerchart migration (2026-10-31): the burn-down is client-mounted
// ({:if browser}); SSR pins the frame + summary + legend contract (the
// a11y text path). Hover (day + £ for both lines) is live-verified.

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

describe("BurnDownChart (A13 interactive migration)", () => {
	it("renders the ChartPanel frame with title and text summary", () => {
		const { body } = renderChart();
		expect(body).toContain("Spend burn-down");
		expect(body).toContain("£98.00 spent of £1500.00 target"); // stub label; live page uses formatCurrency
		expect(body).toContain("day 5 of 31");
	});

	it("the chart is client-mounted — no static SVG leaks into SSR", () => {
		const { body } = renderChart();
		expect(body).not.toContain("<polyline");
		expect(body).not.toContain("data-interactive-chart"); // mounts after hydration only
	});

	it("renders the line legend (final-audit P1: lines indistinguishable)", () => {
		const { body } = renderChart();
		expect(body).toContain("actual spend");
		expect(body).toContain("even pace");
		expect(body).toContain("target £1500.00");
	});

	it("honest empty state when no spend recorded", () => {
		const { body } = render(BurnDownChart, {
			props: {
				points: [],
				totalDays: 31,
				targetPence: 150000,
				todayDay: 1,
				spendLabel: (p: number) => `£${(p / 100).toFixed(2)}`,
			},
		});
		expect(body).toContain("[no spend recorded yet]");
	});
});
