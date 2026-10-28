import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ToolsPage from "../../src/routes/tools/+page.svelte";
import type { ToolsData } from "$lib/server/tools";

// Phase 6: Tools page — four what-if panels rendering from the typed loader.

const baseData: ToolsData = {
	savingsAccounts: [
		{ name: "Monzo Instant", slug: "monzo", taxWrapper: "none", balanceInCents: 150_000, rateBasisPoints: 410 },
		{ name: "Vanguard ISA", slug: "vg", taxWrapper: "isa", balanceInCents: 500_000, rateBasisPoints: 350 },
	],
	debtGoals: [
		{ goalId: 1, name: "Pay off Visa Gold", balanceInCents: 2_315_000, minimumMonthlyInCents: 25_000, aprBasisPoints: 1890 },
	],
	taxYearLabel: "2026/27",
	band: "higher",
	psaAllowanceInCents: 50_000,
	forecastTaxableInterestInCents: 215_735,
	isaRoomInCents: 2_000_000,
};

const renderPage = (overrides: Partial<ToolsData> = {}) =>
	render(ToolsPage, {
		props: {
			data: {
				user: null,
				environment: { mode: "loose", isProduction: false, hasEncryption: false },
				...baseData,
				...overrides,
			},
		},
	});

describe("Tools page (Phase 6)", () => {
	it("renders all four tool panels", () => {
		const { body } = renderPage();
		expect(body).toContain("Rate-change what-if");
		expect(body).toContain("Overpayment simulator");
		expect(body).toContain("ISA optimiser");
		expect(body).toContain("Savings compound projector");
	});

	it("renders the band/PSA context line", () => {
		const { body } = renderPage();
		expect(body).toContain("2026/27 · higher band");
		expect(body).toContain("PSA £500.00");
		expect(body).toContain("40%");
	});

	it("rate tool lists taxable accounts with their rates (ISA excluded)", () => {
		const { body } = renderPage();
		expect(body).toContain("Monzo Instant");
		expect(body).toContain("4.10%");
		expect(body).not.toContain("Vanguard ISA");
	});

	it("overpayment tool shows the debt, minimum, and baseline projection", () => {
		const { body } = renderPage();
		expect(body).toContain("Pay off Visa Gold");
		expect(body).toContain("£250.00"); // minimum payment
		expect(body).toContain("18.90% APR");
	});

	it("ISA optimiser shows forecast taxable interest and today's tax", () => {
		const { body } = renderPage();
		expect(body).toContain("forecast taxable (2026/27)");
		expect(body).toContain("£2,157.35");
		expect(body).toContain("tax today");
	});

	it("compound projector renders the projection SVG with a summary", () => {
		const { body } = renderPage();
		expect(body).toMatch(/viewBox="0 0 600 120"/);
		expect(body).toContain("Compound growth projection");
		expect(body).toContain("contributed");
	});

	it("empty states when no savings or debts exist", () => {
		const { body } = renderPage({ savingsAccounts: [], debtGoals: [] });
		expect(body).toContain("[no taxable savings accounts with balances]");
		expect(body).toContain("[no debt goals with linked accounts]");
	});
});
