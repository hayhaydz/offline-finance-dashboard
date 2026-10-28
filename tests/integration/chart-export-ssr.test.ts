import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { chartFileName, svgToDataUrl } from "$lib/utils/chart-export";
import ChartPanelFixture from "./ChartPanelFixture.svelte";

// Phase 5 line 3: per-chart export — pure helpers + panel buttons.

describe("chart-export helpers", () => {
	it("kebab-cases panel titles into file stems", () => {
		expect(chartFileName("Spend burn-down")).toBe("spend-burn-down");
		expect(chartFileName("Top categories — 2026-10")).toBe("top-categories-2026-10");
		expect(chartFileName("Assets vs liabilities")).toBe("assets-vs-liabilities");
		expect(chartFileName("")).toBe("chart");
	});

	it("base64-encodes the SVG into a data URL", () => {
		const url = svgToDataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
		expect(url).toMatch(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);
	});
});

describe("ChartPanel export buttons (Phase 5 line 3)", () => {
	it("renders [SVG] and [PNG] bracket buttons in the title band", () => {
		const { body } = render(ChartPanelFixture);
		expect(body).toContain("[SVG]");
		expect(body).toContain("[PNG]");
		expect(body).toContain("Download this chart as SVG");
		expect(body).toContain("Download this chart as PNG");
	});

	it("export buttons are marked no-print", () => {
		const { body } = render(ChartPanelFixture);
		expect(body).toMatch(/class="no-print[^"]*"/);
	});
});
