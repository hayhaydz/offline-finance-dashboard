import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
import CategoryBars from "$lib/components/charts/CategoryBars.svelte";
import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";
import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";
import BurnDownChart from "$lib/components/charts/BurnDownChart.svelte";
import RateHeatmap from "$lib/components/charts/RateHeatmap.svelte";
import AllocationBar from "$lib/components/charts/AllocationBar.svelte";
import GoalBulletBar from "$lib/components/charts/GoalBulletBar.svelte";
import CashflowCalendar from "$lib/components/charts/CashflowCalendar.svelte";

// Phase 9 polish: every chart must render an honest empty state (or a
// sane degenerate frame) when its data is empty — no SSR crash, no
// NaN/Infinity leaking into markup. Empty months happen in real usage
// (fresh installs, quiet categories, future-dated salary patterns).

const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

const cases: Array<[string, () => string]> = [
	[
		"NetWorthChart",
		() =>
			render(NetWorthChart, { props: { points: [], formatPence: fmt } }).body,
	],
	[
		"StackedAreaChart",
		() =>
			render(StackedAreaChart, { props: { points: [], formatPence: fmt } })
				.body,
	],
	[
		"MonthlySpendChart",
		() =>
			render(MonthlySpendChart, { props: { points: [], formatPence: fmt } })
				.body,
	],
	[
		"CategoryBars",
		() =>
			render(CategoryBars, { props: { month: "2026-10", categories: [] } })
				.body,
	],
	[
		"DebtWaterfallChart",
		() =>
			render(DebtWaterfallChart, {
				props: {
					goals: [],
					totalDebtInCents: 0,
					projectedDebtFreeDate: new Date("2030-01-01"),
					formatPence: fmt,
				},
			}).body,
	],
	[
		"BurnDownChart",
		() =>
			render(BurnDownChart, {
				props: {
					points: [],
					totalDays: 31,
					targetPence: 100000,
					todayDay: 15,
					spendLabel: fmt,
				},
			}).body,
	],
	[
		"RateHeatmap",
		() =>
			render(RateHeatmap, { props: { rows: [], months: [] } }).body,
	],
	[
		"AllocationBar",
		() => render(AllocationBar, { props: { items: [] } }).body,
	],
	[
		"GoalBulletBar",
		() =>
			render(GoalBulletBar, { props: { percent: 0, bgClass: "bg-green-700" } })
				.body,
	],
	[
		"CashflowCalendar",
		() =>
			render(CashflowCalendar, {
				props: { year: 2026, month: 9, obligations: [] },
			}).body,
	],
	[
		"PsaBulletChart (zero everything)",
		() =>
			render(PsaBulletChart, {
				props: {
					taxYearLabel: "2026/27",
					band: "basic",
					allowancePence: 0,
					actualPence: 0,
					projectedPence: 0,
					formatPence: fmt,
				},
			}).body,
	],
];

describe("charts render empty data without crashing", () => {
	for (const [name, renderCase] of cases) {
		it(name, () => {
			const body = renderCase();
			expect(body.length).toBeGreaterThan(0);
			// no NaN/Infinity leaked into markup
			expect(body).not.toMatch(/>[^<]*(NaN|Infinity|-Infinity)[^<]*</);
		});
	}
});
