<script lang="ts">
	import { browser } from "$app/environment";
	import { LineChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { cumulativeSpendByDay, targetPaceByDay } from "$lib/utils/trends-math";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Target pace chart (v3.2 A14 / V6): the DIAGONAL cumulative target
	 * baseline with cumulative spend crossing over/under it (Monzo target
	 * tab). Interactive layerchart (A13); exact SSR height reservation (V1).
	 */
	let {
		monthKey,
		targetPence,
		dailies,
		daysInMonth,
		height = 190,
	}: {
		monthKey: string;
		targetPence: number;
		dailies: Array<{ day: number; amountPence: number }>;
		daysInMonth: number;
		height?: number;
	} = $props();

	const pace = $derived(targetPaceByDay(targetPence, daysInMonth));
	const spent = $derived(cumulativeSpendByDay(dailies, daysInMonth));
	const rows = $derived(
		Array.from({ length: daysInMonth }, (_, i) => ({
			day: i + 1,
			pace: pace[i],
			spent: spent[i],
		})),
	);

	const compact = (p: number) => `£${Math.round(p / 100).toLocaleString("en-GB")}`;
	const yMax = $derived(Math.max(...rows.map((r) => Math.max(r.pace, r.spent)), 1) * 1.08);

	const series = $derived([
		{ key: "pace", label: "target pace", value: "pace", props: { stroke: "#111827", strokeWidth: 1.25, "stroke-dasharray": "5 4" } },
		{ key: "spent", label: "spent", value: "spent", props: { stroke: "#374151", strokeWidth: 1.75 } },
	]);

	const summary = $derived(
		`${monthKey} · target ${formatCurrency(targetPence)} evenly across ${daysInMonth} days · spend line crossing under = saving`,
	);
</script>

<ChartPanel title="Target pace" {summary}>
	{#if browser}
		<div class="font-mono text-[10px]" data-interactive-chart="target-pace" role="img" aria-label="Cumulative spend against the even target pace line, interactive; summary below">
			<LineChart
				data={rows}
				x="day"
				{series}
				{height}
				padding={{ top: 8, right: 14, bottom: 26, left: 52 }}
				yDomain={[0, yMax]}
				xDomain={[1, daysInMonth]}
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
		<span class="inline-block w-3 border-t-2 border-dashed border-gray-900 align-middle"></span> target pace ·
		<span class="inline-block w-3 border-t-2 border-gray-600 align-middle"></span> cumulative spend ·
		hover for day + £
	</p>
</ChartPanel>
