import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
import ReportsPage from "../../src/routes/overview/reports/+page.svelte";

// Phase 5 line 1: assets-vs-liabilities stacked area + Reports page wiring.

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

describe("Reports page (Phase 5 line 1)", () => {
	it("renders range buttons and both charts from server data", () => {
		const history = pts.map((p) => ({
			...p,
			netWorthInCents: p.totalAssetsInCents + p.totalLiabilitiesInCents,
		}));
		const { body } = render(ReportsPage, {
			props: {
				data: {
					user: null,
					environment: { mode: "loose", isProduction: false, hasEncryption: false },
					netWorthHistory: history,
				},
			},
		});
		expect(body).toContain("[1y]");
		expect(body).toContain("[5y]");
		expect(body).toContain("[all]");
		expect(body).toContain("all time");
		expect(body).toContain("Net worth over time");
		expect(body).toContain("Assets vs liabilities");
	});
});
