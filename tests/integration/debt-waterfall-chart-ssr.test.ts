import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";

// A13 layerchart migration: the waterfall is stacked horizontal bars —
// transparent "debt below" base + visible "this goal" segment — so right
// edges walk the cumulative remaining balance down from total to zero.
// Payoff dates ride the band labels (client-side); the summary carries
// total, order, and the projected debt-free horizon server-side.

const goals = [
	{ name: "Clear Mastercard", slug: "a", remainingInCents: 45000, projectedPayoffDate: new Date("2028-03-01") },
	{ name: "Rewards Card 0% Payoff", slug: "b", remainingInCents: 85000, projectedPayoffDate: new Date("2029-08-01") },
	{ name: "Pay off Visa Gold", slug: "c", remainingInCents: 231500, projectedPayoffDate: new Date("2034-02-01") },
	{ name: "Final Car Loan Push", slug: "d", remainingInCents: 1120000, projectedPayoffDate: new Date("2029-05-01") },
];
const total = goals.reduce((s, g) => s + g.remainingInCents, 0);
const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

const renderChart = () =>
	render(DebtWaterfallChart, {
		props: {
			goals,
			totalDebtInCents: total,
			projectedDebtFreeDate: new Date("2034-02-01"),
			formatPence: fmt,
		},
	});

describe("DebtWaterfallChart (A13 layerchart migration)", () => {
	it("names the panel, total, and projected debt-free date in the summary", () => {
		const { body } = renderChart();
		expect(body).toContain("Debt payoff waterfall");
		expect(body).toContain("£14815.00");
		expect(body).toContain("projected debt-free 2034-02");
		expect(body).toContain("snowball order");
	});

	it("SSR ships frame + summary only — the interactive steps mount client-side", () => {
		const { body } = renderChart();
		expect(body).toContain("chart-panel");
		expect(body).toContain("chart-panel-summary");
		expect(body).not.toContain("<rect"); // no static geometry server-side
	});

	it("empty state when no debt goals", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals: [],
				totalDebtInCents: 0,
				projectedDebtFreeDate: null,
				formatPence: fmt,
			},
		});
		expect(body).toContain("[no debt goals]");
		expect(body).toContain("No tracked debt goals");
	});
});
