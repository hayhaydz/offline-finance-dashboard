import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ToolsPage from "../../src/routes/tools/+page.svelte";
import ToolSubPage from "../../src/routes/tools/[slug]/+page.svelte";
import ToolRateWhatIf from "$lib/components/tools/ToolRateWhatIf.svelte";
import ToolOverpayment from "$lib/components/tools/ToolOverpayment.svelte";
import ToolStooze from "$lib/components/tools/ToolStooze.svelte";
import { TOOLS } from "$lib/utils/tool-registry";
import type { ToolsData } from "$lib/server/tools";

// v3 B08 (R13): tools index card grid + per-tool sub-pages. The tool
// components render from the typed loader slice each needs.

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

describe("Tools index (R13)", () => {
	it("renders a card per tool linking to its sub-page", () => {
		const { body } = render(ToolsPage, {
			props: {
				data: {
					taxYearLabel: "2026/27",
					band: "higher",
					psaAllowanceInCents: 50_000,
				},
			},
		});
		expect(body).toContain("8 TOOLS");
		for (const tool of TOOLS) {
			expect(body).toContain(tool.name);
			expect(body).toContain(`href="/tools/${tool.slug}"`);
		}
		expect(body).toContain("Open Tool");
		expect(body).toContain("2026/27 · higher band");
	});
});

describe("Tool sub-pages (R13)", () => {
	const renderSub = (slug: string, extra: Record<string, unknown> = {}) =>
		render(ToolSubPage, {
			props: {
				data: {
					tool: TOOLS.find((t) => t.slug === slug)!,
					toolsData: baseData,
					cards: [],
					netWorthHistory: [],
					statementGaps: [],
					...extra,
				},
			},
		});

	it("renders the tool shell with [All Tools] and the selected component", () => {
		const { body } = renderSub("rate-what-if");
		expect(body).toContain("Rate-change what-if");
		expect(body).toContain("All Tools");
		expect(body).toContain("Print / PDF");
		expect(body).toContain("Monzo Instant"); // component rendered
	});

	it("stooze sub-page asks for a promo date before projecting (sweep-9 empty state)", () => {
		const { body } = renderSub("stooze");
		expect(body).toContain("savings rate");
		expect(body).toContain("revert APR");
		// no promo date seeded (cards: []) → honest empty state, no zero table
		expect(body).toContain("Set a promo end date");
		expect(body).not.toContain("pay everything by");
	});

	it("stooze calculator exposes the date input that gates projection", () => {
		const result = render(ToolStooze, { props: { cards: [] } });
		// the date input drives the table client-side (live-verified);
		// SSR pins that the input + empty state render
		expect(result.body).toContain('type="date"');
		expect(result.body).toContain("Set a promo end date");
	});

	it("fi-projector sub-page asks for more history when there is none", () => {
		const { body } = renderSub("fi-projector");
		expect(body).toContain("at least two snapshots");
	});
});

describe("Tool component details (the old cramped cards, deepened)", () => {
	it("rate tool lists taxable accounts with rates and scenario table (ISA excluded)", () => {
		const { body } = render(ToolRateWhatIf, { props: { data: baseData } });
		expect(body).toContain("Monzo Instant");
		expect(body).toContain("4.10%");
		expect(body).not.toContain("Vanguard ISA");
		expect(body).toContain("total taxable interest");
		expect(body).toContain("tax above PSA (higher band)");
	});

	it("overpayment tool shows debts plus the all-debts comparison table", () => {
		const { body } = render(ToolOverpayment, { props: { data: baseData } });
		expect(body).toContain("Pay off Visa Gold");
		expect(body).toContain("£250.00"); // minimum payment
		expect(body).toContain("Debt-free (+£50)");
	});

	it("empty states when no savings or debts exist", () => {
		const rate = render(ToolRateWhatIf, {
			props: { data: { ...baseData, savingsAccounts: [] } },
		});
		expect(rate.body).toContain("[no taxable savings accounts with balances]");
		const over = render(ToolOverpayment, {
			props: { data: { ...baseData, debtGoals: [] } },
		});
		expect(over.body).toContain("[no debt goals with linked accounts]");
	});
});

describe("Statement gap finder tool (v3.2)", () => {
	const renderSub = (slug: string, extra: Record<string, unknown> = {}) =>
		render(ToolSubPage, {
			props: {
				data: {
					tool: TOOLS.find((t) => t.slug === slug)!,
					toolsData: baseData,
					cards: [],
					netWorthHistory: [],
					statementGaps: [],
					...extra,
				},
			},
		});

	it("renders declared history with missing months flagged", () => {
		const { body } = renderSub("statement-gaps", {
			statementGaps: [
				{ slug: "main-current", name: "Main Current", type: "current", month: "2026-08" },
				{ slug: "main-current", name: "Main Current", type: "current", month: "2026-09" },
				// 2026-10 interior hole
				{ slug: "main-current", name: "Main Current", type: "current", month: "2026-11" },
				{ slug: "savings-one", name: "Savings One", type: "savings", month: "2026-09" },
			],
		});
		expect(body).toContain("2 accounts with declared history");
		expect(body).toContain("2026-08 → 2026-11");
		expect(body).toContain("2026-10");
		expect(body).toContain("complete"); // Savings One single-month range
		expect(body).not.toContain('type="radio"');
	});

	it("degrades honestly with no declared history", () => {
		const { body } = renderSub("statement-gaps");
		expect(body).toContain("[no declared transactions");
	});
});
