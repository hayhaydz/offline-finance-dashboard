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

describe("MonthlySpendChart (Phase 5 line 2)", () => {
	it("renders one column per month with value + month labels", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: months, formatPence: fmt },
		});
		expect((body.match(/<rect /g) || []).length).toBe(months.length);
		expect(body).toContain(">£6.1k<"); // latest value label (short form)
		expect(body).toContain(">10/26<"); // month label MM/YY
		expect(body).toContain(">05/26<");
	});

	it("draws the dashed 6-month average with a tooltip", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: months, formatPence: fmt },
		});
		expect(body).toContain("chart-dashed");
		expect(body).toContain("6-month average £4436.60"); // 2,661,957p / 6
	});

	it("panel summary names the latest month and average", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: months, formatPence: fmt },
		});
		expect(body).toContain("Spending by month");
		expect(body).toContain("£6.1k in 2026-10");
	});

	it("is a print-safe viewBox SVG with role=img", () => {
		const { body } = render(MonthlySpendChart, {
			props: { points: months, formatPence: fmt },
		});
		expect(body).toMatch(/viewBox="0 0 600 200"/);
		expect(body).toContain('role="img"');
	});
});

describe("CategoryBars (Phase 5 line 2)", () => {
	it("renders a bar per category in the category colour", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: cats },
		});
		expect(body).toContain("Top categories — 2026-10");
		expect((body.match(/style="width: [0-9.]+%; background: #/g) || []).length).toBe(
			cats.length,
		);
		expect(body).toContain("background: #FC8181");
	});

	it("shows £ values and share-of-month percentages", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: cats },
		});
		expect(body).toContain("£2,500.00");
		expect(body).toContain(">51%<"); // 250k / 490k
		expect(body).toContain(">8%<"); // 40k / 490k
	});

	it("summary names the top category and its share", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: cats },
		});
		expect(body).toContain("Top: Housing (£2,500.00, 51% of 2026-10)");
	});

	it("empty state when no categorised spend", () => {
		const { body } = render(CategoryBars, {
			props: { month: "2026-10", categories: [] },
		});
		expect(body).toContain("[no categorised spending]");
	});
});
