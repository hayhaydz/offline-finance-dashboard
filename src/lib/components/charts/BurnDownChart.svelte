<script lang="ts">
	import { browser } from "$app/environment";
	import { LineChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Budget burn-down — A13 layerchart migration (2026-10-31): cumulative
	 * spend (solid ink) vs linear even-pace line (dashed) to the monthly
	 * target, now with crosshair hover (day + £ for both lines). Frame +
	 * summary + legend text unchanged; client-only mount.
	 */
	function compactPence(pence: number): string {
		return `£${Math.round(Math.abs(pence) / 100).toLocaleString("en-GB")}`;
	}

	let {
		points,
		totalDays,
		targetPence,
		todayDay,
		spendLabel,
	}: {
		points: { day: number; cumulativePence: number }[];
		totalDays: number;
		targetPence: number;
		todayDay: number;
		spendLabel: (pence: number) => string;
	} = $props();

	const maxCumulative = $derived(
		Math.max(targetPence, ...points.map((p) => p.cumulativePence), 1),
	);
	const yMax = $derived(Math.ceil(maxCumulative * 1.05));
	const lastPoint = $derived(points[Math.min(todayDay, points.length) - 1] ?? points[points.length - 1]);

	type Row = { day: number; actual: number | null; pace: number | null };
	const rows = $derived.by(() => {
		const actuals = new Map(points.map((p) => [p.day, p.cumulativePence]));
		const out: Row[] = [];
		for (let d = 1; d <= totalDays; d++) {
			out.push({
				day: d,
				actual: actuals.has(d) ? (actuals.get(d) as number) : null,
				// pace exists for every day up to today; beyond today it is
				// the same projection — keep it dashed-full for reference
				pace: (targetPence * (d - 1)) / Math.max(totalDays - 1, 1),
			});
		}
		return out;
	});

	const series = $derived([
		{
			key: "actual",
			label: "actual spend",
			value: "actual",
			color: "#111827",
			props: { defined: (r: Row) => r.actual !== null, strokeWidth: 1.5 },
		},
		{
			key: "pace",
			label: "even pace",
			value: "pace",
			color: "#9ca3af",
			props: { "stroke-dasharray": "4 3" },
		},
	]);

	const summary = $derived(
		`${spendLabel(lastPoint?.cumulativePence ?? 0)} spent of ${spendLabel(targetPence)} target · day ${Math.min(todayDay, totalDays)} of ${totalDays} · pace line = even spend to target`,
	);
</script>

<ChartPanel title="Spend burn-down" {summary}>
	{#if points.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no spend recorded yet]</div>
	{:else if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="burn-down"
			role="img"
			aria-label="Cumulative spend versus even pace to the monthly target, interactive; summary below"
		>
			<LineChart
				data={rows}
				x="day"
				{series}
				height={200}
				padding={{ top: 8, right: 16, bottom: 26, left: 46 }}
				yDomain={[0, yMax]}
				xDomain={[1, totalDays]}
				xNice={false}
				props={{
					xAxis: { format: (v: number) => `d${Math.round(v)}` },
					yAxis: { format: (v: number) => compactPence(v) },
					tooltip: {
						header: { format: (d: number) => `day ${Math.round(d)} of ${totalDays}` },
						item: { format: (v: number) => spendLabel(v) },
					},
				}}
			/>
		</div>
	{/if}
	<!-- line legend (Phase 9 polish): the two lines are otherwise
	     indistinguishable to first-time readers; server-rendered text -->
	{#if points.length > 0}
		<div class="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1 text-[10px] text-gray-500">
			<span class="flex items-center gap-1"><span class="w-3 border-t border-gray-900"></span>actual spend</span>
			<span class="flex items-center gap-1"><span class="w-3 border-t border-dashed border-gray-400"></span>even pace</span>
			<span class="flex items-center gap-1"><span class="w-2 border-t-2 border-gray-600"></span>target {spendLabel(targetPence)}</span>
			<span class="text-gray-400">· hover for day + £</span>
		</div>
	{/if}
</ChartPanel>
