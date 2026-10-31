import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
import CategoryBars from "$lib/components/charts/CategoryBars.svelte";

// Phase 5 line 2: spending by month (columns) + top categories (bars).

const months = [
	{ month: "2026-05", totalPence: 402000 },
	{ month: "2026-06", totalPence: 380500 },
	{ month: "2026-07", totalPence: 455000 },
	{ month: "2026-08", totalPence: 299900 },
	{ month: "2026-09", totalPence: 510000 },
	{ month: "2026-10", totalPence: 614557 },
];
const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

const cats = [
	{ name: "Housing", colour: "#FC8181", spentPence: 250000 },
	{ name: "Groceries", colour: "#63B3ED", spentPence: 120000 },
	{ name: "Eating Out", colour: "#F6AD55", spentPence: 80000 },
	{ name: "Transport", colour: "#A0AEC0", spentPence: 40000 },
];

describe("MonthlySpendChart (A13 layerchart migration)", () => {
	it("panel summary names the latest month and average", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: months, formatPence: fmt },
		});
		expect(body).toContain("Spending by month");
		expect(body).toContain("£6.1k in 2026-10");
		expect(body).toContain("6-month average £4.4k"); // 2,661,957p / 6, short form (exact value rides the avg tick + tooltip)
	});

	it("SSR ships frame + summary only — columns mount client-side", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: months, formatPence: fmt },
		});
		expect(body).toContain("chart-panel");
		expect(body).toContain("chart-panel-summary");
		expect(body).not.toContain("<rect"); // no static geometry server-side
	});

	it("empty state when no spending", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: [], formatPence: fmt },
		});
		expect(body).toContain("[no spending data]");
		expect(body).toContain("No spending recorded yet");
	});
});

describe("CategoryBars (A13 layerchart migration)", () => {
	it("summary names the top category and its share", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: cats },
		});
		expect(body).toContain("Top categories — 2026-10");
		expect(body).toContain("Top: Housing (£2,500.00, 51% of 2026-10)");
	});

	it("SSR ships frame + summary only — bars mount client-side in ledger colours", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: cats },
		});
		expect(body).toContain("chart-panel");
		expect(body).toContain("chart-panel-summary");
		expect(body).not.toContain("<rect"); // no static geometry server-side
	});

	it("empty state when no categorised spend", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: [] },
		});
		expect(body).toContain("[no categorised spending]");
	});
});
