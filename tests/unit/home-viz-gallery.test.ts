import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import HomeVizGallery from "$lib/components/charts/HomeVizGallery.svelte";
import type { Obligation } from "$lib/utils/surface-views";

// v3 R3: home visualisation gallery — click-to-switch viz types below the
// reverted header. SSR shows the default (Trend) view; empty-data views are
// hidden; the gallery disappears entirely when no view has data. Click
// switching is covered by the live CDP pass, not SSR.

const trend = [
	{ date: "2026-09-01", netWorthInCents: 246_000_00 },
	{ date: "2026-10-01", netWorthInCents: 247_500_00 },
	{ date: "2026-10-28", netWorthInCents: 246_749_25 }
];

const obligations: Obligation[] = [
	{
		date: "2026-10-01",
		description: "Rent",
		amountPence: -120_000
	}
];

const cashflow = { year: 2026, month: 10, obligations };

const assetGroups = [
	{ name: "Current", value: 50_000_00 },
	{ name: "Savings", value: 196_749_25 }
];

describe("HomeVizGallery", () => {
	it("renders the gallery with the Trend view active by default", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, cashflow, assetGroups }
		});
		expect(body).toContain("VISUALISATIONS");
		expect(body).toContain("Net worth over time");
		expect(body).toContain('aria-selected="true"');
		// non-default views are switchable but not rendered
		expect(body).toContain("Cashflow");
		expect(body).toContain("Allocation");
		// chart's own a11y summary: +£749.25 over 3 snapshots
		expect(body).toContain("+£749.25");
		expect(body).toContain("3 snapshots");
	});

	it("hides unavailable views (no obligations → no Cashflow tab)", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, cashflow: null, assetGroups }
		});
		expect(body).toContain("Net worth over time");
		expect(body).not.toContain(">Cashflow<");
		expect(body).toContain("Allocation");
	});

	it("falls back to the first view with data when trend is empty", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend: [], cashflow, assetGroups }
		});
		expect(body).toContain("VISUALISATIONS");
		expect(body).toContain("Cashflow calendar — October 2026");
		expect(body).not.toContain("Net worth over time");
	});

	it("renders nothing when no view has data", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend: [], cashflow: null, assetGroups: [] }
		});
		expect(body).not.toContain("VISUALISATIONS");
		expect(body).not.toContain("role=\"tablist\"");
	});
});
