import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ChartPanelFixture from "./ChartPanelFixture.svelte";

// Phase 4 foundation (Variant B): every chart ships inside a bordered
// ChartPanel with a mandatory plain-text summary line (a11y invariant —
// a chart without a text summary is incomplete by construction).

const renderPanel = (summary?: string) =>
	summary ? render(ChartPanelFixture, { props: { summary } }) : render(ChartPanelFixture);

describe("ChartPanel (Phase 4 foundation)", () => {
	it("renders title, chart body region, and the summary line", () => {
		const { body } = renderPanel();
		expect(body).toContain("Net worth over time");
		expect(body).toContain("Net worth fell £1,056 over 4 snapshots");
		expect(body).toContain("chart-panel");
	});

	it("renders the terminal-aesthetic panel classes", () => {
		const { body } = renderPanel();
		expect(body).toContain("chart-panel");
		expect(body).toContain("chart-panel-title");
		expect(body).toContain("chart-panel-summary");
	});

	it("summary is real visible text (not aria-only) — a11y invariant", () => {
		const { body } = renderPanel("Spending 62% of target, on pace");
		expect(body).toContain(">Spending 62% of target, on pace<");
	});

	it("omits the controls snippet when none is given (export buttons remain — Phase 5 line 3)", () => {
		const { body } = renderPanel();
		// no custom controls smuggled in, but [SVG]/[PNG] export buttons ship by default
		expect(body).not.toContain("range-picker-stub");
		expect(body).toContain("[SVG]");
		expect(body).toContain("[PNG]");
	});
});
