<script lang="ts">
	import { browser } from "$app/environment";
	import { BarChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * PSA bullet — A13 layerchart migration (2026-10-31): the measure is
	 * a single stacked horizontal bar with colour-coded segments (within
	 * allowance = ink, over allowance = red, projected = gray); the
	 * allowance marker is a labelled x tick + gridline at the PSA value.
	 * Hover tooltip per segment. Frame + summary + legend unchanged.
	 */
	let {
		taxYearLabel,
		band,
		allowancePence,
		actualPence,
		projectedPence,
		formatPence,
	}: {
		taxYearLabel: string;
		band: string;
		allowancePence: number;
		actualPence: number;
		projectedPence: number;
		formatPence: (pence: number) => string;
	} = $props();

	const forecast = $derived(actualPence + projectedPence);
	const overAllowance = $derived(actualPence > allowancePence && allowancePence > 0);
	const withinPence = $derived(Math.min(actualPence, allowancePence));
	const overPence = $derived(overAllowance ? actualPence - allowancePence : 0);
	const scaleMax = $derived(Math.max(forecast, allowancePence, 1) * 1.12);

	const row = $derived({
		row: "taxable interest",
		within: withinPence,
		over: overPence,
		projected: projectedPence,
	});

	const series = $derived([
		{
			key: "within",
			label: "actual (within PSA)",
			value: "within",
			color: "#111827",
		},
		{
			key: "over",
			label: "actual (over PSA)",
			value: "over",
			color: "#b91c1c",
		},
		{
			key: "projected",
			label: "projected",
			value: "projected",
			color: "#9ca3af",
		},
	]);

	// ticks at 0 / PSA (the marker) / forecast — the PSA gridline IS the
	// allowance marker, its label says so
	const xTicks = $derived(
		allowancePence > 0 ? [0, allowancePence, forecast] : [0, forecast],
	);
	function tickFormat(v: number): string {
		if (allowancePence > 0 && v === allowancePence) return `PSA ${formatPence(v)}`;
		if (v === forecast && forecast > 0) return `fc ${formatPence(v)}`;
		return v === 0 ? "£0" : formatPence(v);
	}

	const summary = $derived(
		allowancePence === 0
			? `${taxYearLabel} · ${band} band — no tax-free interest allowance (additional rate). Actual ${formatPence(actualPence)} taxable.`
			: `${taxYearLabel} · ${band} band · PSA ${formatPence(allowancePence)} — actual ${formatPence(actualPence)}${projectedPence > 0 ? `, projected +${formatPence(projectedPence)} → forecast ${formatPence(forecast)}` : ""} taxable${overAllowance ? ` — OVER allowance by ${formatPence(actualPence - allowancePence)}` : ""}`,
	);
</script>

<ChartPanel title="Personal savings allowance" {summary}>
	{#if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="psa-bullet"
			role="img"
			aria-label="Taxable interest bullet against the personal savings allowance, interactive; summary below"
		>
			<BarChart
				data={[row]}
				y="row"
				orientation="horizontal"
				{series}
				seriesLayout="stack"
				height={110}
				padding={{ top: 8, right: 20, bottom: 24, left: 8 }}
				xDomain={[0, scaleMax]}
				props={{
					xAxis: { ticks: xTicks, format: tickFormat },
					yAxis: { ticks: [] },
					tooltip: {
						header: { format: (r: string) => String(r) },
						item: { format: (v: number) => formatPence(v) },
					},
				}}
			/>
		</div>
	{:else}
		<div class="text-xs text-gray-500 p-2">[chart loads in browser]</div>
	{/if}
	<!-- segment legend: explains the segments + the PSA gridline marker -->
	<div class="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1 text-[10px] text-gray-500">
		<span class="flex items-center gap-1"><span class="w-3 h-2 bg-gray-900"></span>actual</span>
		<span class="flex items-center gap-1"><span class="w-3 h-2 bg-gray-400"></span>projected</span>
		<span class="flex items-center gap-1"><span class="w-3 h-2 bg-red-700"></span>over allowance</span>
		<span class="flex items-center gap-1">⋮ gridline = PSA {allowancePence > 0 ? formatPence(allowancePence) : "(none)"}</span>
	</div>
</ChartPanel>
