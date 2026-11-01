import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import BudgetPage from "../../src/routes/overview/trends/[month]/+page.svelte";

// v3 B09 (R9 + R29): the budget page answers the month at a glance — a
// 4-cell summary strip under the header, then a two-column body (progress
// + categories left; config, pace, chart, history right).

const data = {
	selectedMonth: "2026-10",
	isCurrentMonth: true,
	budget: {
		totalTargetInCents: 200_000,
		excludedCategoryIds: [],
		excludedAccountIds: [],
		excludedTypes: [],
	},
	status: {
		totalSpent: 820_000, // 410% — over budget
		daysElapsed: 29,
		totalDays: 31,
		avgPerDay: 28_276,
		projectedTotal: 876_552,
	},
	categoryBreakdown: [
		{ id: 1, name: "Groceries", colour: "#68D391", spent: 45_000, target: 60_000 },
		{ id: 2, name: "Eating out", colour: "#F6AD55", spent: 210_000, target: 80_000 },
		{ id: -1, name: "Uncategorised", colour: "#A0AEC0", spent: 30_000, target: null },
	],
	categories: [
		{ id: 1, name: "Groceries", colour: "#68D391" },
		{ id: 2, name: "Eating out", colour: "#F6AD55" },
	],
	accounts: [{ id: 9, name: "Monzo", type: "current" }],
	amendments: [],
	history: { months: [], pagination: { page: 1, totalPages: 1 } },
	burnDown: [],
} as never;

describe("Budget page redesign (R9 + R29)", () => {
	const renderPage = () =>
		render(BudgetPage, { props: { data, form: undefined as never } });

	it("renders the 4-cell summary strip with status, spent, pace and over", () => {
		const { body } = renderPage();
		expect(body).toContain("Status");
		expect(body).toContain("over budget");
		expect(body).toContain("Spent / target");
		expect(body).toContain("£8,200.00");
		expect(body).toContain("Pace");
		expect(body).toContain("over pace");
		expect(body).toContain("Over");
	});

	it("renders the full-width flow with the pace|burn-down pair (v3.1 A08)", () => {
		const { body } = renderPage();
		// v3.1 design-quality: the old grid-cols-3 (19%-filled 2/3 column)
		// was replaced by a single flow: progress → [pace | burn] pair →
		// history. v3.2 V4: config moved to /overview/trends/[month]/config
		expect(body).not.toContain('class="grid lg:grid-cols-3"');
		expect(body).toContain('class="grid lg:grid-cols-2 border-b border-black"');
		expect(body).toContain("SPENDING PACE");
		expect(body).toContain("Spend vs pace");
		expect(body).toContain("HISTORY");
	});

	it("v3.2 V4: config + amendments live behind a single header link, not on the month page", () => {
		const { body } = renderPage();
		expect(body).toContain("Config &amp; amendments");
		expect(body).toContain('href="/overview/trends/2026-10/config"');
		// the config surfaces themselves are gone from the analysis page
		expect(body).not.toContain("CATEGORY TARGETS");
		expect(body).not.toContain("TARGET / MO");
		expect(body).not.toContain("AMENDMENT OPTIONS");
		expect(body).not.toContain("FILTERS");
		expect(body).not.toContain("aria-expanded"); // no config accordions left
	});
});
