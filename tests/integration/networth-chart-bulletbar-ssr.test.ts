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

describe("NetWorthChart (Phase 4 V1 #1)", () => {
	it("renders the ChartPanel frame with a trend summary", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		expect(body).toContain("Net worth over time");
		expect(body).toContain("5 snapshots");
		expect(body).toContain("-£2040.75"); // delta in summary
	});

	it("draws the line path, area fill, and square markers", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		expect(body).toContain("chart-panel");
		expect(body).toMatch(/<path d="M\d/); // series line
		expect(body).toContain("fill=\"var(--chart-fill)\""); // area fill
		expect((body.match(/<rect/g) || []).length).toBe(nwPoints.length); // one square per point
	});

	it("is a print-safe viewBox SVG with an accessible label", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		expect(body).toMatch(/viewBox="0 0 600 220"/);
		expect(body).toContain('role="img"');
		expect(body).toContain("aria-label");
	});

	it("labels first/mid/last dates and y range; dashed zero line when straddling", () => {
		// range crossing zero → the dashed zero reference must render
		const straddle = [
			{ date: "2026-07-15", netWorthInCents: -300000 },
			{ date: "2026-08-15", netWorthInCents: -100000 },
			{ date: "2026-09-15", netWorthInCents: 50000 },
			{ date: "2026-10-28", netWorthInCents: 200000 },
		];
		const { body } = render(NetWorthChart, {
			props: { points: straddle, formatPence: fmt },
		});
		expect(body).toContain(">2026-07<");
		expect(body).toContain(">2026-10<");
		expect(body).toContain("chart-dashed"); // zero reference
	});

	it("renders an explicit empty state with zero points", () => {
		const { body } = render(NetWorthChart, {
			props: { points: [], formatPence: fmt },
		});
		expect(body).toContain("[no snapshot data]");
		expect(body).toContain("No snapshots yet");
	});
});

describe("GoalBulletBar (Phase 4 V1 #3)", () => {
	it("tags the last point with a bold value label", () => {
		const { body } = render(NetWorthChart, {
			props: { points: nwPoints, formatPence: fmt },
		});
		// bold ink tag carrying the latest value (-£7040.75)
		expect(body).toContain('font-weight="bold"');
		expect(body.match(/<text[^>]*font-weight="bold"[^>]*>([^<]*)</)?.[1]).toBe("£-7040.75");
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
