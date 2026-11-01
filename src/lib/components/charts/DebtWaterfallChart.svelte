<script lang="ts">
	import { browser } from "$app/environment";
	import { BarChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Debt payoff waterfall — A13 layerchart migration (2026-10-31):
	 * floating descending steps preserved as stacked horizontal bars
	 * (transparent "debt below" base + visible "this goal" segment), so
	 * each bar's right edge still walks the cumulative remaining balance
	 * down from total debt toward zero. Payoff dates ride the band labels;
	 * hover tooltip shows this-goal + debt-below per step. Frame +
	 * summary unchanged; client-only mount.
	 */
	/** compact axis labels (pence → "£2,500"); tooltips keep full precision */
	function compactPence(pence: number): string {
		return `£${Math.round(Math.abs(pence) / 100).toLocaleString("en-GB")}`;
	}

	let {
		goals,
		totalDebtInCents,
		projectedDebtFreeDate,
		formatPence,
	}: {
		goals: Array<{
			name: string;
			slug: string;
			remainingInCents: number;
			projectedPayoffDate: Date | null;
		}>;
		totalDebtInCents: number;
		projectedDebtFreeDate: Date | null;
		formatPence: (pence: number) => string;
	} = $props();

	const dateShort = (d: Date | null) =>
		d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : "—";

	// cumulative remaining AFTER each goal (snowball order): the step's
	// left edge — stacking a transparent base of that size floats each
	// step so right edges descend from total toward zero.
	// v3.1 third mandate: paid-off goals (£0 remaining) render as an empty
	// lane with a label and no bar — they are not payoff STEPS, so they
	// leave the chart (counted in the summary note instead).
	const activeGoals = $derived(goals.filter((g) => g.remainingInCents > 0));
	const paidOff = $derived(goals.length - activeGoals.length);
	type Row = { label: string; base: number; step: number };
	const rows = $derived.by(() => {
		let acc = totalDebtInCents;
		return activeGoals.map((g): Row => {
			const right = acc;
			acc = Math.max(0, acc - g.remainingInCents);
			return {
				label: `${g.name} · ${dateShort(g.projectedPayoffDate)}`,
				base: acc,
				step: g.remainingInCents,
			};
		});
	});

	const series = [
		{
			key: "base",
			label: "debt below (later goals)",
			value: "base",
			color: "transparent",
			props: { stroke: "transparent" },
		},
		{
			key: "step",
			label: "this goal remaining",
			value: "step",
			color: "#e5e7eb",
			props: { stroke: "#111827", strokeWidth: 1 },
		},
	];

	const maxV = $derived(Math.max(totalDebtInCents, 1) * 1.05);

	const n = $derived(activeGoals.length);
	const summary = $derived(
		n === 0 && paidOff === 0
			? "No tracked debt goals"
			: `${formatPence(totalDebtInCents)} across ${n} goal${n !== 1 ? "s" : ""} (snowball order, smallest first)${paidOff > 0 ? ` · ${paidOff} already paid off` : ""} · each bar's date = payoff at its own minimum · projected debt-free ${projectedDebtFreeDate ? dateShort(projectedDebtFreeDate) : "unknown (below-minimum payments on some goals)"}`,
	);
</script>

<ChartPanel title="Debt payoff waterfall" {summary}>
	{#if n === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no debt goals]</div>
	{:else if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="debt-waterfall"
			role="img"
			aria-label="Debt payoff waterfall steps in snowball order, interactive; summary below"
		>
			<BarChart
				data={rows}
				y="label"
				orientation="horizontal"
				{series}
				seriesLayout="stack"
				height={Math.max(n * 34 + 28, 100)}
				padding={{ top: 6, right: 20, bottom: 24, left: 220 }}
				xDomain={[0, maxV]}
				props={{
					// v3.1 A09 chart craft: ~5 ticks (default over-ticked: 19 labels)
					xAxis: { ticks: 5, format: (v: number) => compactPence(v) },
					tooltip: {
						header: { format: (l: string) => String(l) },
						item: { format: (v: number) => formatPence(v) },
					},
				}}
			/>
		</div>
	{:else}
		<!-- V1 CLS fix (2026-11-01): reserve the chart's exact height
		     server-side — see AllocationBar. -->
		<div class="border border-dashed border-gray-200" style="height: {Math.max(n * 34 + 28, 100)}px" aria-hidden="true"></div>
	{/if}
	<p class="text-[10px] text-gray-600 px-1 pt-1">
		steps descend from total debt toward zero (snowball) · each date = that goal at its own minimum — freed minimums are not rolled forward · hover for amounts
	</p>
</ChartPanel>
