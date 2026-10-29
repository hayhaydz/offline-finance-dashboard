import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import HomeVizGallery from "$lib/components/charts/HomeVizGallery.svelte";
import type { Obligation } from "$lib/utils/surface-views";

// v3 R3 + R30: untitled bento grid of compact viz cells below the home
// header. All available views render simultaneously in differently-sized
// cells; no section title; each cell carries an expand control (R3's click
// interaction). Expand/collapse itself is client state — live CDP pass.

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

describe("HomeVizGallery (bento)", () => {
	it("renders all views simultaneously in one grid, with no section title", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, cashflow, assetGroups }
		});
		expect(body).not.toContain("VISUALISATIONS");
		expect(body).toContain('class="grid grid-cols-3');
		expect(body).toContain("Net worth over time");
		expect(body).toContain("Cashflow calendar — October 2026");
		expect(body).toContain("Allocation");
	});

	it("sizes cells differently (bento spans) and fills tracks fully", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, cashflow, assetGroups }
		});
		expect(body).toContain('class="col-span-2" data-viz-cell="trend"');
		expect(body).toContain('class="col-span-3" data-viz-cell="cashflow"');
		expect(body).toContain('class="col-span-1" data-viz-cell="allocation"');
		// wide aspect: compact 900x180 canvas, no width caps inside cells
		expect(body).toContain('viewBox="0 0 900 180"');
		expect(body).not.toContain("max-w-[");
		// single-bracket export buttons (ChartPanel renders brackets via CSS)
		expect(body).not.toContain("[[SVG]]");
		expect(body).not.toContain("[[PNG]]");
	});

	it("every cell carries an expand control with aria-expanded state", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, cashflow, assetGroups }
		});
		const expandButtons = body.match(/aria-expanded="false"/g) ?? [];
		expect(expandButtons.length).toBe(3);
	});

	it("hides unavailable views (no obligations → no cashflow cell)", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, cashflow: null, assetGroups }
		});
		expect(body).toContain("Net worth over time");
		expect(body).toContain('data-viz-cell="allocation"');
		expect(body).not.toContain('data-viz-cell="cashflow"');
	});

	it("renders nothing when no view has data", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend: [], cashflow: null, assetGroups: [] }
		});
		expect(body).not.toContain("data-viz-cell");
		expect(body).not.toContain('class="grid');
	});
});
