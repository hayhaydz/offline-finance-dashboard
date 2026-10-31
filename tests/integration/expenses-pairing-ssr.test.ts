import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ExpensesPage from "../../src/routes/overview/expenses/+page.svelte";

// v3.1 A06: expenses keeps TREND (hero chart) + GRID (14-col table) full
// width; RANGE FILL and EMERGENCY FUND REFERENCE — similar-volume
// utility/reference panels — pair in a 2-col row below the grid.

const data = {
	series: [
		{ month: "2026-01", amountInCents: 210_000 },
		{ month: "2026-02", amountInCents: 210_000 },
	],
	grid: [
		{
			year: 2026,
			months: Array.from({ length: 12 }, (_, i) => ({
				month: `2026-${String(i + 1).padStart(2, "0")}`,
				amountInCents: i < 2 ? 210_000 : null,
				note: null,
			})),
		},
	],
	latest: { month: "2026-02", amountInCents: 210_000, note: null },
} as never;

describe("Expenses layout (v3.1 A06)", () => {
	it("renders all four sections in wireframe order", () => {
		const { body } = render(ExpensesPage, { props: { data } });
		const order = ["TREND", "GRID", "RANGE FILL", "EMERGENCY FUND REFERENCE"].map(
			(k) => body.indexOf(k),
		);
		expect(order.every((i) => i >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it("RANGE FILL and EFR share the 2-col pair grid", () => {
		const { body } = render(ExpensesPage, { props: { data } });
		const pairOpen = body.indexOf('class="grid grid-cols-1 lg:grid-cols-2');
		const rangeAt = body.indexOf("RANGE FILL");
		const efrAt = body.indexOf("EMERGENCY FUND REFERENCE");
		expect(pairOpen).toBeGreaterThan(body.indexOf("GRID") === -1 ? 0 : body.indexOf("Known"));
		expect(rangeAt).toBeGreaterThan(pairOpen);
		expect(efrAt).toBeGreaterThan(pairOpen);
		// the pair wrapper closes after EFR content (grid close after its section)
		const efrEnd = body.indexOf("</section>", efrAt);
		expect(body.slice(efrEnd, efrEnd + 40)).toContain("</div>");
	});

	it("emergency fund reference computes 1/3/6/12 cover from latest month", () => {
		const { body } = render(ExpensesPage, { props: { data } });
		expect(body).toContain("£2,100.00");
		expect(body).toContain("£6,300.00"); // 3 months
		expect(body).toContain("£12,600.00"); // 6 months
		expect(body).toContain("£25,200.00"); // 12 months
	});
});
