import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import HomeVizGallery from "$lib/components/charts/HomeVizGallery.svelte";

// v3 R3 + R30: untitled bento grid of compact viz cells below the home
// header. All available views render simultaneously in differently-sized
// cells; no section title; each cell carries an expand control (R3's click
// interaction). Expand/collapse itself is client state — live CDP pass.
//
// v3.2 V2 (2026-11-01): the cashflow calendar moved OUT of the gallery to
// the bottom of the home page (user direction) — the gallery is the
// trend+allocation pair only. Calendar rendering is pinned by the home
// SSR tests instead.

const trend = [
	{ date: "2026-09-01", netWorthInCents: 246_000_00 },
	{ date: "2026-10-01", netWorthInCents: 247_500_00 },
	{ date: "2026-10-28", netWorthInCents: 246_749_25 }
];

const assetGroups = [
	{ name: "Current", value: 50_000_00 },
	{ name: "Savings", value: 196_749_25 }
];

describe("HomeVizGallery (bento)", () => {
	it("renders all views simultaneously in one grid, with no section title", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, assetGroups }
		});
		expect(body).not.toContain("VISUALISATIONS");
		expect(body).toContain('class="grid grid-cols-3');
		expect(body).toContain("Net worth over time");
		expect(body).toContain("Allocation");
	});

	it("sizes cells differently (bento spans) and fills tracks fully", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, assetGroups }
		});
		expect(body).toContain('class="col-span-2" data-viz-cell="trend"');
		expect(body).toContain('class="col-span-1" data-viz-cell="allocation"');
		// A13: the trend cell mounts an interactive layerchart client-side
		// (aspect=wide → 180px band); no static svg may leak server-side,
		// and no width caps live inside cells
		expect(body).not.toContain("<path");
		expect(body).not.toContain("max-w-[");
		// single-bracket export buttons (ChartPanel renders brackets via CSS)
		expect(body).not.toContain("[[SVG]]");
		expect(body).not.toContain("[[PNG]]");
	});

	it("every cell carries an expand control with aria-expanded state", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, assetGroups }
		});
		const expandButtons = body.match(/aria-expanded="false"/g) ?? [];
		expect(expandButtons.length).toBe(2);
	});

	it("hides unavailable views (no asset groups → no allocation cell)", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend, assetGroups: [] }
		});
		expect(body).toContain("Net worth over time");
		expect(body).not.toContain('data-viz-cell="allocation"');
	});

	it("renders nothing when no view has data", () => {
		const { body } = render(HomeVizGallery, {
			props: { trend: [], assetGroups: [] }
		});
		expect(body).not.toContain("data-viz-cell");
		expect(body).not.toContain('class="grid');
	});
});
