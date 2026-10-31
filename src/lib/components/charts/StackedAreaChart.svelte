<script lang="ts">
	import { browser } from "$app/environment";
	import { AreaChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Assets-vs-liabilities composition — A13 layerchart migration
	 * (2026-10-31): stacked-about-zero areas (assets band above zero in
	 * light gray, liabilities band below zero in darker gray — the data is
	 * already negative), hover crosshair + per-date tooltip for both
	 * bands. ChartPanel frame + summary + export unchanged; client-only
	 * mount (layerchart measures + SSR module cycle).
	 */
	let {
		points,
		formatPence,
	}: {
		/** Oldest → newest snapshots (liabilities already negative) */
		points: Array<{
			date: string;
			totalAssetsInCents: number;
			totalLiabilitiesInCents: number;
		}>;
		formatPence: (pence: number) => string;
	} = $props();

	type Row = { date: Date; assets: number; liabilities: number };
	const rows = $derived(
		points.map((p): Row => {
			const [y, m, d] = p.date.split("-").map(Number);
			return {
				date: new Date(y, (m || 1) - 1, d || 1),
				assets: p.totalAssetsInCents,
				liabilities: p.totalLiabilitiesInCents,
			};
		}),
	);

	const series = [
		{
			key: "assets",
			label: "assets",
			value: "assets",
			color: "#e5e7eb",
			props: { stroke: "#6b7280", strokeWidth: 1 },
		},
		{
			key: "liabilities",
			label: "liabilities",
			value: "liabilities",
			color: "#d1d5db",
			props: { stroke: "#6b7280", strokeWidth: 1 },
		},
	];

	const assets = $derived(points.map((p) => p.totalAssetsInCents));
	const liabilities = $derived(points.map((p) => p.totalLiabilitiesInCents));
	const maxAssets = $derived(points.length ? Math.max(...assets, 0) : 0);
	const minLiab = $derived(points.length ? Math.min(...liabilities, 0) : 0);
	const yHi = $derived(maxAssets * 1.05 || 1);
	const yLo = $derived(minLiab * 1.05 || -1);

	const yearTicks = $derived(
		rows
			.filter((r, i) => i === 0 || r.date.getFullYear() !== rows[i - 1].date.getFullYear())
			.map((r) => r.date),
	);

	const lastPt = $derived(points[points.length - 1]);

	const summary = $derived(
		points.length === 0
			? "No snapshots yet — record balances to build the composition"
			: points.length === 1
				? `One snapshot: assets ${formatPence(points[0].totalAssetsInCents)} · liabilities ${formatPence(points[0].totalLiabilitiesInCents)}`
				: `Assets ${formatPence(lastPt.totalAssetsInCents)} · liabilities ${formatPence(lastPt.totalLiabilitiesInCents)} · net ${formatPence(lastPt.totalAssetsInCents + lastPt.totalLiabilitiesInCents)} as of ${lastPt.date} (${points.length} snapshots)`,
	);
</script>

<ChartPanel title="Assets vs liabilities" {summary}>
	{#if points.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no snapshot data]</div>
	{:else if points.length === 1}
		<div class="text-xs text-gray-600 p-2 text-center">
			One snapshot ({points[0].date}) — two or more draw the bands.
		</div>
	{:else if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="assets-liabilities"
			role="img"
			aria-label="Assets band above zero versus liabilities band below zero, interactive; summary below"
		>
			<AreaChart
				data={rows}
				x="date"
				{series}
				seriesLayout="stack"
				height={240}
				padding={{ top: 10, right: 16, bottom: 26, left: 52 }}
				yDomain={[yLo, yHi]}
				xDomain={rows.length ? [rows[0].date, rows[rows.length - 1].date] : undefined}
				xNice={false}
				props={{
					xAxis: { ticks: yearTicks, format: (d: Date) => String(d.getFullYear()), tickLabelProps: { dy: "1.3em" } },
					yAxis: { format: (v: number) => formatPence(v) },
					tooltip: {
						header: { format: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` },
						item: { format: (v: number) => formatPence(Math.abs(v)) },
					},
				}}
			/>
		</div>
		<p class="text-[10px] text-gray-600 px-1 pt-1">
			light band above zero = assets · darker band below zero = liabilities · hover for both
		</p>
	{/if}
</ChartPanel>
