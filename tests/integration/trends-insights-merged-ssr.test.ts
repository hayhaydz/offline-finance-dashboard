import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import InsightsPage from "../../src/routes/overview/trends/insights/+page.svelte";

// v3.2 (2026-11-01 user steer): the trends insights page IS the trends
// surface — 3 terminal tabs (balance/spending/target); the old budgets
// month page was merged into the TARGET tab (history table + config
// links). These pins replace the deleted budget-page-redesign test.

const data = {
	monthKey: "2026-10",
	currentMonthKey: "2026-11",
	previousKey: "2026-09",
	chosenMonthDailies: [
		{ day: 1, amountPence: -4500 },
		{ day: 15, amountPence: -12000 },
	],
	previousMonthDailies: [{ day: 1, amountPence: -3000 }],
	chosenMonthTotalPence: 716_556,
	chosenMonthDeclared: true,
	homeCurrentMonthKey: "2026-11",
	homeCurrentTotalPence: 48_500,
	accountCount: 16,
	balanceFlows: [
		{ monthKey: "2026-09", moneyInPence: 500_000, moneyOutPence: 400_000, closingBalancePence: 100_000 },
		{ monthKey: "2026-10", moneyInPence: 624_472, moneyOutPence: 703_557, closingBalancePence: 20_915 },
	],
	balanceDailies: Array.from({ length: 31 }, (_, i) => ({ day: i + 1, balancePence: -710_569 + i * 1000 })),
	categories: {
		included: [{ name: "Groceries", spentPence: 45_000 }],
		excluded: [{ name: "Rent", spentPence: 97_500 }],
	},
	targetPence: 150_000,
	spentPence: 716_556,
	startingBalancePence: -631_484,
	estimatedEndPence: null,
	avgInPence: 500_000,
	avgOutPence: 400_000,
	daysInMonth: 31,
	history: {
		months: [
			{ month: "2026-10", totalTarget: 150_000, actualSpent: 716_556 },
			{ month: "2026-09", totalTarget: 150_000, actualSpent: 90_000 },
		],
		pagination: { page: 1, totalPages: 1 },
	},
} as never;

describe("Trends insights — merged surface (v3.2 steer 2)", () => {
	const renderPage = () =>
		render(InsightsPage, { props: { data } });

	it("renders the three terminal tabs (balance default) with month chooser + config link", () => {
		const { body } = renderPage();
		expect(body).toContain(">balance<");
		expect(body).toContain(">spending<");
		expect(body).toContain(">target<");
		expect(body).toContain("Config &amp; amendments");
		expect(body).toContain('href="/overview/trends/2026-10/config"');
		expect(body).toContain("Oct 2026");
	});

	it("balance tab (month scope) reserves the daily chart and keeps the honest D0 subline", () => {
		const { body } = renderPage();
		// SSR: the daily balance chart reserves exact height via its panel
		// title (the interactive mount is browser-only)
		expect(body).toContain("Balance · 2026-10");
		expect(body).toContain("not realtime");
	});

	it("the old month page is gone — no Monthly Trend h1, config is a link not a page section", () => {
		const { body } = renderPage();
		expect(body).not.toContain("Monthly Trend");
		expect(body).not.toContain("AMENDMENT OPTIONS");
		expect(body).not.toContain("SPENDING PACE");
		// tabs are client-side; the target tab's content contract is pinned
		// live (see progress ledger) — SSR pins the shell + data hooks:
		expect(body).toContain(">balance<");
		expect(body).toContain("Oct 2026");
	});

	it("no default HTML radio/select anywhere", () => {
		const { body } = renderPage();
		expect(body).not.toContain('type="radio"');
		expect(body).not.toContain("<select");
	});
});
