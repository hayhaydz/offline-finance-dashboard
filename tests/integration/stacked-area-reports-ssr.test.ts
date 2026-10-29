import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
import ReportsPage from "../../src/routes/overview/reports/+page.svelte";
import ReportPaperPage from "../../src/routes/overview/reports/[slug]/+page.svelte";

// v3 B07 (R10): reports are separate dated pieces in a science-paper
// template; the stacked-area chart is a figure inside them.

const pts = [
	{ date: "2025-11-01", totalAssetsInCents: 2500000, totalLiabilitiesInCents: -2600000 },
	{ date: "2025-12-01", totalAssetsInCents: 2450000, totalLiabilitiesInCents: -2580000 },
	{ date: "2026-01-01", totalAssetsInCents: 2460000, totalLiabilitiesInCents: -2550000 },
	{ date: "2026-02-01", totalAssetsInCents: 2467492, totalLiabilitiesInCents: -2537900 },
];
const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

describe("StackedAreaChart (Phase 5 line 1)", () => {
	it("renders the ChartPanel with a composition summary", () => {
		const { body } = render(StackedAreaChart, {
			props: { points: pts, formatPence: fmt },
		});
		expect(body).toContain("Assets vs liabilities");
		expect(body).toContain("4 snapshots");
		expect(body).toContain("assets");
		expect(body).toContain("liabilities");
	});

	it("draws both bands, the hatch pattern, and the net worth line", () => {
		const { body } = render(StackedAreaChart, {
			props: { points: pts, formatPence: fmt },
		});
		expect(body).toContain("liab-hatch");
		expect(body).toMatch(/fill="url\(#liab-hatch\)"/);
		expect(body).toContain("fill=\"var(--chart-fill)\"");
		// 2 bands + 1 net line = 3 paths with drawn geometry
		expect((body.match(/<path d="M/g) || []).length).toBe(3);
	});

	it("includes the dashed zero reference and prefixed axis labels", () => {
		const { body } = render(StackedAreaChart, {
			props: { points: pts, formatPence: fmt },
		});
		expect(body).toContain("chart-dashed");
		expect(body).toContain(">max £");
		expect(body).toContain(">min £");
	});

	it("is a print-safe viewBox SVG with an accessible label", () => {
		const { body } = render(StackedAreaChart, {
			props: { points: pts, formatPence: fmt },
		});
		expect(body).toMatch(/viewBox="0 0 600 240"/);
		expect(body).toContain('role="img"');
		expect(body).toContain("aria-label");
	});
});

describe("Reports v2 index (R10)", () => {
	it("renders a dated article list linking each report", () => {
		const { body } = render(ReportsPage, {
			props: {
				data: {
					reports: [
						{
							slug: "net-worth-trajectory",
							title: "Net Worth Trajectory",
							blurb: "Where the number has been.",
						},
						{
							slug: "credit-strategy",
							title: "Credit Strategy",
							blurb: "0% deadlines and payoff pressure.",
						},
					],
					today: "2026-10-29",
				},
			},
		});
		expect(body).toContain("Net Worth Trajectory");
		expect(body).toContain("Credit Strategy");
		expect(body).toContain("[Read Report]");
		expect(body).toContain('href="/overview/reports/net-worth-trajectory"');
		expect(body).toContain("2 PIECES");
	});
});

describe("Report paper (science-paper template, R10)", () => {
	it("renders title, date, abstract, method and findings tables", () => {
		const { body } = render(ReportPaperPage, {
			props: {
				data: {
					report: {
						slug: "test-report",
						title: "A Focused Question",
						date: "2026-10-29",
						abstract: "The answer is 42 pounds.",
						method: ["Data: something", "Math: division"],
						findings: [
							{
								heading: "Headline numbers",
								rows: [
									{ label: "net", value: "£42.00", flag: "green" },
									{ label: "debt", value: "£0.00" },
								],
							},
						],
					},
				},
			},
		});
		expect(body).toContain("A Focused Question");
		expect(body).toContain("29 OCT 2026");
		expect(body).toContain("ABSTRACT");
		expect(body).toContain("The answer is 42 pounds.");
		expect(body).toContain("METHOD");
		expect(body).toContain("Data: something");
		expect(body).toContain("Headline numbers");
		expect(body).toContain("£42.00");
		expect(body).toContain("[All Reports]");
		expect(body).toContain("[Print / PDF]");
	});

	it("renders the net-worth figures from shared history data", () => {
		const history = pts.map((p, i) => ({
			date: `2026-0${i + 1}-01`,
			netWorthInCents: p.totalAssetsInCents + p.totalLiabilitiesInCents,
			totalAssetsInCents: p.totalAssetsInCents,
			totalLiabilitiesInCents: p.totalLiabilitiesInCents,
		}));
		const { body } = render(ReportPaperPage, {
			props: {
				data: {
					report: {
						slug: "net-worth-trajectory",
						title: "Net Worth Trajectory",
						date: "2026-10-29",
						abstract: "abstract text",
						method: ["m"],
						findings: [
							{ heading: "Trajectory", figure: "netWorth" },
							{ heading: "Composition", figure: "stackedArea" },
						],
						netWorthHistory: history,
					},
				},
			},
		});
		expect(body).toContain("Net worth over time");
		expect(body).toContain("Assets vs liabilities");
	});
});
