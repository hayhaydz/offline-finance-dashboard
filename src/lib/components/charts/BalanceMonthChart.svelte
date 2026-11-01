<script lang="ts">
	import { browser } from "$app/environment";
	import { LineChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Balance-month chart (v3.2 V6 fix, 2026-11-01 user report): day-by-day
	 * running balance for the CHOSEN month only (x = day 1..last, £ y) —
	 * the month scope is not the multi-month series. Interactive layerchart
	 * (A13); exact SSR height reservation (V1); domain contains negatives
	 * (balances can go below zero).
	 */
	let {
		monthKey,
		dailies,
		daysInMonth,
		height = 200,
	}: {
		monthKey: string;
		dailies: Array<{ day: number; balancePence: number }>;
		daysInMonth: number;
		height?: number;
	} = $props();

	const rows = $derived(
		dailies.map((d) => ({ day: d.day, balance: d.balancePence })),
	);

	const compact = (p: number) => {
		const v = Math.round(Math.abs(p) / 100);
		return `${p < 0 ? "−" : ""}£${v.toLocaleString("en-GB")}`;
	};
	// headroom both ways; domain must contain negatives (see insights fix)
	const yMax = $derived(Math.max(...rows.map((r) => r.balance), 0) * 1.08);
	const yMin = $derived(Math.min(...rows.map((r) => r.balance), 0) * 1.08);

	const series = $derived([
		{ key: "balance", label: "balance", value: "balance", props: { stroke: "#111827", strokeWidth: 1.75 } },
	]);

	const summary = $derived(
		`${monthKey} · running balance day 1–${daysInMonth} · declared statement transactions, not realtime`,
	);
</script>

<ChartPanel title="Balance · {monthKey}" {summary}>
	{#if browser}
		<div class="font-mono text-[10px]" data-interactive-chart="balance-month" role="img" aria-label="Running balance across the days of the month, interactive; summary below">
			<LineChart
				data={rows}
				x="day"
				{series}
				{height}
				padding={{ top: 8, right: 14, bottom: 26, left: 62 }}
				yDomain={[yMin, yMax]}
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
		<span class="inline-block w-3 border-t-2 border-gray-900 align-middle"></span> end-of-day balance ·
		hover for day + £
	</p>
</ChartPanel>
