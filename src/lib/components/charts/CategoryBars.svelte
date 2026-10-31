<script lang="ts">
	import { browser } from "$app/environment";
	import { BarChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Top categories for a month — A13 layerchart migration (2026-10-31):
	 * horizontal bars keep each category's ledger colour via the chart's
	 * `c` colour channel + explicit `cRange` (layerchart's idiomatic
	 * per-category colour), and gain a hover tooltip (category + £ +
	 * share of month). Frame + summary unchanged; client-only mount.
	 */
	let {
		month,
		categories,
	}: {
		month: string;
		categories: Array<{ name: string; colour: string; spentPence: number }>;
	} = $props();

	const top = $derived(categories.slice(0, 8));
	const total = $derived(categories.reduce((s, c) => s + c.spentPence, 0));
	const maxV = $derived(Math.max(...top.map((c) => c.spentPence), 1));

	const rows = $derived(top.map((c) => ({ name: c.name, spent: c.spentPence })));
	// cRange aligns index-wise with the first-seen c domain (= top order)
	const cRange = $derived(top.map((c) => c.colour));

	const series = [
		{
			key: "spent",
			label: "spent",
			value: "spent",
			props: { stroke: "#111827", strokeWidth: 0.5 },
		},
	];

	const summary = $derived(
		top.length === 0
			? `No categorised spending in ${month}`
			: `Top: ${top[0].name} (${formatCurrency(top[0].spentPence)}${total > 0 ? `, ${Math.round((top[0].spentPence / total) * 100)}% of ${month}` : ""}) across ${categories.length} categories`,
	);
</script>

<ChartPanel title="Top categories — {month}" {summary}>
	{#if top.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no categorised spending]</div>
	{:else if browser}
		<div class="font-mono text-[10px]" data-interactive-chart="category-bars">
			<BarChart
				data={rows}
				y="name"
				c="name"
				{cRange}
				{series}
				orientation="horizontal"
				height={Math.max(top.length * 26 + 24, 90)}
				padding={{ top: 6, right: 20, bottom: 24, left: 150 }}
				xDomain={[0, maxV * 1.05]}
				props={{
					xAxis: { format: (v: number) => formatCurrency(v) },
					tooltip: {
						header: { format: (n: string) => String(n) },
						item: { format: (v: number) => `${formatCurrency(v)}${total > 0 ? ` · ${Math.round((v / total) * 100)}% of ${month}` : ""}` },
					},
				}}
			/>
		</div>
		<p class="text-[10px] text-gray-600 px-1 pt-1">
			bar colours = your ledger category colours · hover for £ + share of month
		</p>
	{/if}
</ChartPanel>
