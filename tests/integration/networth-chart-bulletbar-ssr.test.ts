import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
import GoalBulletBar from "$lib/components/charts/GoalBulletBar.svelte";

// Phase 4 V1 #1 + #3: net worth line chart and goal bullet bars.

const nwPoints = [
	{ date: "2026-07-15", netWorthInCents: -500000 },
	{ date: "2026-08-15", netWorthInCents: -400000 },
	{ date: "2026-09-15", netWorthInCents: -650000 },
	{ date: "2026-10-18", netWorthInCents: -600000 },
	{ date: "2026-10-28", netWorthInCents: -704075 },
];

const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

describe("NetWorthChart (A13 layerchart migration)", () => {
	it("renders the ChartPanel frame with a trend summary", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		expect(body).toContain("Net worth over time");
		expect(body).toContain("5 snapshots");
		expect(body).toContain("-£2040.75"); // delta in summary
	});

	it("SSR ships frame + summary only — interactive layer mounts client-side", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		expect(body).toContain("chart-panel");
		expect(body).toContain("chart-panel-summary");
		// no static svg geometry in the server payload (HistoryTrendChart
		// client-only mount contract); hover tooltip arrives with mount
		expect(body).not.toContain("<path");
		expect(body).not.toContain("<rect");
	});

	it("single-point and empty states are honest server-rendered text", () => {
		const one = render(NetWorthChart, {
			props: { points: [nwPoints[0]], formatPence: fmt },
		}).body;
		expect(one).toContain("One snapshot");
		expect(one).toContain("Record another to draw a line");
		const none = render(NetWorthChart, {
			props: { points: [], formatPence: fmt },
		}).body;
		expect(none).toContain("[no snapshot data]");
		expect(none).toContain("No snapshots yet");
	});
});

describe("GoalBulletBar (Phase 4 V1 #3)", () => {
	it("the latest value rides the summary line (client chart draws the tag)", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		// A13: the interactive layerchart tooltip/axis carries values on
		// hover; the always-visible latest value lives in the summary
		expect(body).toContain("(latest £-7040.75)");
	});

	it("renders the bracketed fill bar with width from percent", () => {
		const { body } = render(GoalBulletBar, {
			props: { percent: 62, bgClass: "bg-amber-600" },
		});
		expect(body).toContain(">[</span>");
		expect(body).toContain("width: 62%");
		expect(body).toContain("bg-amber-600");
	});

	it("renders one tick per milestone with achieved/pending state", () => {
		const { body } = render(GoalBulletBar, {
			props: {
				percent: 40,
				bgClass: "bg-green-700",
				ticks: [
					{ pct: 8.3, label: "1mo", achieved: true },
					{ pct: 25, label: "3mo", achieved: true },
					{ pct: 50, label: "6mo", achieved: false },
					{ pct: 100, label: "12mo", achieved: false },
				],
			},
		});
		expect((body.match(/title="[^"]*— reached/g) || []).length).toBe(2);
		expect((body.match(/title="[^"]*— pending/g) || []).length).toBe(2);
		expect(body).toContain("left: 8.3%");
		expect(body).toContain("bg-green-700\""); // achieved tick colour (may coincide with fill class)
		expect(body).toContain("bg-gray-400"); // pending tick colour
	});

	it("rounds tick percentages to one decimal in tooltips + shows the tick legend", () => {
		const { body } = render(GoalBulletBar, {
			props: {
				percent: 40,
				bgClass: "bg-green-700",
				ticks: [
					{ pct: 33.33333333333333, label: "half-way", achieved: false },
					{ pct: 66.66666666666667, label: "mostly", achieved: true },
				],
			},
		});
		expect(body).toContain("(33.3%)");
		expect(body).toContain("(66.7%)");
		expect(body).not.toContain("(33.333");
		expect(body).toContain("milestone reached");
		expect(body).toContain("pending");
	});

	it("hides the tick legend when there are no ticks or the bar is archived", () => {
		const noTicks = render(GoalBulletBar, { props: { percent: 50, bgClass: "bg-green-700" } }).body;
		expect(noTicks).not.toContain("milestone reached");
		const archived = render(GoalBulletBar, {
			props: {
				percent: 50,
				bgClass: "bg-green-700",
				archived: true,
				ticks: [{ pct: 50, label: "x", achieved: true }],
			},
		}).body;
		expect(archived).not.toContain("milestone reached");
	});

	it("clamps percent into 0–100", () => {
		const { body } = render(GoalBulletBar, {
			props: { percent: 410, bgClass: "bg-red-600" },
		});
		expect(body).toContain("width: 100%");
	});

	it("ticks are aria-hidden decoration (labels live in adjacent text)", () => {
		const { body } = render(GoalBulletBar, {
			props: {
				percent: 10,
				bgClass: "bg-green-700",
				ticks: [{ pct: 25, label: "3mo", achieved: false }],
			},
		});
		expect(body).toContain('aria-hidden="true"');
	});
});
