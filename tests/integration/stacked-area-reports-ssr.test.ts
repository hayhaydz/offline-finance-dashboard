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

describe("StackedAreaChart (A13 layerchart migration)", () => {
	it("renders the ChartPanel with a composition summary", () => {
		const { body } = render(StackedAreaChart, {
			props: { points: pts, formatPence: fmt },
		});
		expect(body).toContain("Assets vs liabilities");
		expect(body).toContain("4 snapshots");
		expect(body).toContain("Assets"); // summary carries all three readings
		expect(body).toContain("liabilities");
		expect(body).toContain("net"); // net worth rides the summary line
	});

	it("SSR ships the frame + summary only — the interactive layer mounts client-side", () => {
		const { body } = render(StackedAreaChart, {
			props: { points: pts, formatPence: fmt },
		});
		// HistoryTrendChart contract: layerchart renders after mount; no
		// static svg geometry may leak into the server payload
		expect(body).not.toContain("<path");
		expect(body).not.toContain("liab-hatch");
		// the summary is real visible text (a11y invariant)
		expect(body).toContain("chart-panel-summary");
	});

	it("renders an honest single-snapshot and empty state server-side", () => {
		const one = render(StackedAreaChart, {
			props: { points: [pts[0]], formatPence: fmt },
		}).body;
		expect(one).toContain("One snapshot");
		const none = render(StackedAreaChart, {
			props: { points: [], formatPence: fmt },
		}).body;
		expect(none).toContain("[no snapshot data]");
		expect(none).toContain("No snapshots yet");
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
		expect(body).toContain("Read Report");
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
		expect(body).toContain("All Reports");
		expect(body).toContain("Print / PDF");
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

	it("renders related-reading prev/next when siblings exist (R-H12)", () => {
		const { body } = render(ReportPaperPage, {
			props: {
				data: {
					report: {
						slug: "test-report",
						title: "A Focused Question",
						date: "2026-10-29",
						abstract: "abstract",
						method: ["m"],
						findings: [],
					},
					siblings: {
						prev: { slug: "earlier-paper", title: "Earlier Paper" },
						next: { slug: "later-paper", title: "Later Paper" },
					},
				},
			},
		});
		expect(body).toContain("RELATED READING");
		expect(body).toContain('href="/overview/reports/earlier-paper"');
		expect(body).toContain("← Earlier Paper");
		expect(body).toContain('href="/overview/reports/later-paper"');
		expect(body).toContain("Later Paper →");
		expect(body).toContain('aria-label="Related reading"');
	});

	it("omits the related-reading band when the paper is alone", () => {
		const { body } = render(ReportPaperPage, {
			props: {
				data: {
					report: {
						slug: "test-report",
						title: "A Focused Question",
						date: "2026-10-29",
						abstract: "abstract",
						method: ["m"],
						findings: [],
					},
					siblings: { prev: null, next: null },
				},
			},
		});
		expect(body).not.toContain("RELATED READING");
	});
});
