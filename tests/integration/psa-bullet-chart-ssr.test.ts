import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { ComponentProps } from "svelte";
import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";

// A13 layerchart migration: the bullet is a stacked horizontal bar with
// colour-coded segments (within=ink, over=red, projected=gray) and the
// PSA marker as a labelled x tick/gridline. The server payload ships the
// frame + summary + legend; the interactive layer mounts client-side.

const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

const renderBullet = (props: Partial<ComponentProps<typeof PsaBulletChart>>) => {
	const defaults: ComponentProps<typeof PsaBulletChart> = {
		taxYearLabel: "2026/27",
		band: "basic",
		allowancePence: 100000,
		actualPence: 0,
		projectedPence: 0,
		formatPence: fmt,
	};
	return render(PsaBulletChart, { props: { ...defaults, ...props } });
};

describe("PsaBulletChart (A13 layerchart migration)", () => {
	it("summarises allowance, actual, projection, and forecast", () => {
		const { body } = renderBullet({
			allowancePence: 100000,
			actualPence: 60000,
			projectedPence: 30000,
		});
		expect(body).toContain("Personal savings allowance");
		expect(body).toContain("PSA £1000.00"); // stub formatter (live uses formatCurrency)
		expect(body).toContain("forecast £900.00");
	});

	it("says OVER and by how much when the measure crosses the allowance", () => {
		const { body } = renderBullet({
			allowancePence: 50000,
			actualPence: 70000,
			projectedPence: 0,
		});
		expect(body).toContain("OVER allowance by £200.00");
	});

	it("handles the additional-rate £0 allowance (no marker, explicit note)", () => {
		const { body } = renderBullet({
			band: "additional",
			allowancePence: 0,
			actualPence: 4000,
			projectedPence: 0,
		});
		expect(body).toContain("no tax-free interest allowance");
		expect(body).not.toContain("PSA £0.00");
	});

	it("SSR ships frame + summary + legend; the chart mounts client-side", () => {
		const { body } = renderBullet({
			allowancePence: 100000,
			actualPence: 60000,
			projectedPence: 30000,
		});
		expect(body).toContain("chart-panel");
		expect(body).toContain("chart-panel-summary");
		// V1 CLS fix (2026-11-01): SSR reserves the chart's exact height so
		// hydration cannot shift the layout mid-click
		expect(body).toContain('style="height: 110px"');
		expect(body).not.toContain("<rect"); // no static geometry server-side
	});

	it("renders the segment legend incl. the PSA gridline marker note", () => {
		const { body } = renderBullet({
			allowancePence: 100000,
			actualPence: 60000,
			projectedPence: 30000,
		});
		expect(body).toContain(">actual</span>");
		expect(body).toContain(">projected</span>");
		expect(body).toContain("over allowance");
		expect(body).toContain("gridline = PSA £1000.00");
	});
});
