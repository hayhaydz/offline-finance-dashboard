<script lang="ts">
	import { browser } from "$app/environment";
	import { BarChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Spending by month — A13 layerchart migration (2026-10-31): one
	 * column per month (gray fill, ink outline), hover tooltip per column
	 * (month + total), the 6-month average drawn as a labelled y tick
	 * ("avg £…") so the reference survives the migration. ChartPanel
	 * frame + summary + export unchanged; client-only mount.
	 */
	let {
		points,
		formatPence,
	}: {
		/** Oldest → newest months */
		points: Array<{ month: string; totalPence: number }>;
		formatPence: (pence: number) => string;
	} = $props();

	const shortLabel = (pence: number) => {
		const units = pence / 100;
		return units >= 1000 ? `£${(units / 1000).toFixed(1)}k` : `£${Math.round(units)}`;
	};

	type Row = { month: string; total: number };
	const rows = $derived(
		points.map((p): Row => ({ month: `${p.month.slice(5)}/${p.month.slice(2, 4)}`, total: p.totalPence })),
	);

	const series = [
		{
			key: "spend",
			label: "spend",
			value: "total",
			color: "#d1d5db",
			props: { stroke: "#111827", strokeWidth: 1 },
		},
	];

	const maxV = $derived(Math.max(...points.map((p) => p.totalPence), 1) * 1.1);
	const avg = $derived(
		points.length > 0
			? points.reduce((s, p) => s + p.totalPence, 0) / points.length
			: 0,
	);
	// y ticks: 0, the average (labelled), and the padded top — the avg
	// tick carries the dashed-reference role the static chart drew
	const avgRounded = $derived(Math.round(avg));
	const yTicks = $derived([0, avgRounded, Math.round(maxV)]);

	const last = $derived(points[points.length - 1]);
	const summary = $derived(
		points.length === 0
			? "No spending recorded yet"
			: `${shortLabel(last.totalPence)} in ${last.month} · 6-month average ${shortLabel(avg)}`,
	);
</script>

<ChartPanel title="Spending by month" {summary}>
	{#if points.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no spending data]</div>
	{:else if browser}
		<div class="font-mono text-[10px]" data-interactive-chart="monthly-spend">
			<BarChart
				data={rows}
				x="month"
				{series}
				height={200}
				padding={{ top: 10, right: 16, bottom: 26, left: 56 }}
				yDomain={[0, maxV]}
				props={{
					yAxis: {
						ticks: yTicks,
						format: (v: number) => (v === avgRounded && avgRounded > 0 ? `avg ${shortLabel(v)}` : shortLabel(v)),
					},
					tooltip: {
						header: { format: (m: string) => String(m) },
						item: { format: (v: number) => formatPence(v) },
					},
				}}
			/>
		</div>
		<p class="text-[10px] text-gray-600 px-1 pt-1">
			one column per month · hover for the exact total · avg = mean of the window
		</p>
	{/if}
</ChartPanel>
