<script lang="ts">
	import { browser } from "$app/environment";
	import { LineChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { cumulativeSpendByDay, daysInMonthKey } from "$lib/utils/trends-math";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Trends month comparison (v3.2 A14 / V6): cumulative spend by day of
	 * month, THIS month vs LAST month (Monzo's homepage graph). Interactive
	 * layerchart per the A13 mandate; exact SSR height reservation per the
	 * V1 CLS fix; statement-honest copy lives at the call site (D0).
	 */
	let {
		currentMonthKey,
		previousMonthKey,
		currentDaily,
		previousDaily,
		height = 190,
		title = "Trends",
	}: {
		currentMonthKey: string;
		previousMonthKey: string;
		currentDaily: Array<{ day: number; amountPence: number }>;
		previousDaily: Array<{ day: number; amountPence: number }>;
		height?: number;
		title?: string;
	} = $props();

	const days = $derived(
		Math.max(
			daysInMonthKey(currentMonthKey),
			daysInMonthKey(previousMonthKey),
		),
	);

	const currentCum = $derived(cumulativeSpendByDay(currentDaily, days));
	const previousCum = $derived(cumulativeSpendByDay(previousDaily, days));

	const rows = $derived(
		Array.from({ length: days }, (_, i) => ({
			day: i + 1,
			thisMonth: currentCum[i],
			lastMonth: previousCum[i],
		})),
	);

	const compact = (p: number) => `£${Math.round(p / 100).toLocaleString("en-GB")}`;

	const series = $derived([
		{
			key: "thisMonth",
			label: "this month",
			value: "thisMonth",
			props: { stroke: "#111827", strokeWidth: 1.5 },
		},
		{
			key: "lastMonth",
			label: "last month",
			value: "lastMonth",
			props: { stroke: "#9ca3af", strokeWidth: 1.25, "stroke-dasharray": "4 3" },
		},
	]);

	const yMax = $derived(
		Math.max(...rows.map((r) => Math.max(r.thisMonth, r.lastMonth)), 1) * 1.08,
	);

	const summary = $derived(
		`${compact(currentCum[days - 1] ?? 0)} spent this month · ${compact(previousCum[days - 1] ?? 0)} same span last month`,
	);
</script>

<ChartPanel title={title} {summary}>
	{#if browser}
		<div class="font-mono text-[10px]" data-interactive-chart="trends-compare" role="img" aria-label="Cumulative spend by day of month, this month versus last month, interactive; summary below">
			<LineChart
				data={rows}
				x="day"
				{series}
				{height}
				padding={{ top: 8, right: 14, bottom: 26, left: 52 }}
				yDomain={[0, yMax]}
				xDomain={[1, days]}
				xNice={false}
				props={{
					xAxis: { format: (v: number) => `d${Math.round(v)}` },
					yAxis: { format: (v: number) => compact(v) },
					tooltip: {
						header: { format: (d: number) => `day ${Math.round(d)}` },
						item: { format: (v: number) => formatCurrency(v) },
					},
				}}
			/>
		</div>
	{:else}
		<!-- V1 CLS fix (2026-11-01): reserve the chart's exact height
		     server-side — see AllocationBar. -->
		<div class="border border-dashed border-gray-200" style="height: {height}px" aria-hidden="true"></div>
	{/if}
	<p class="text-[10px] text-gray-600 px-1 pt-1">
		<span class="inline-block w-3 border-t-2 border-gray-900 align-middle"></span> this month ·
		<span class="inline-block w-3 border-t-2 border-dashed border-gray-400 align-middle"></span> last month ·
		hover for day + £
	</p>
</ChartPanel>
