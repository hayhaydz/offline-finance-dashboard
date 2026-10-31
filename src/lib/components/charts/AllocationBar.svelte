<script lang="ts">
	import { browser } from "$app/environment";
	import { BarChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { allocationShares } from "$lib/utils/surface-views";

	/**
	 * Goals allocation view — A13 layerchart migration (2026-10-31):
	 * the stacked composition sliver made 2% segments unreadable; each
	 * goal now gets its own ink-density row (darkest = biggest share)
	 * with hover (goal + £ + share). Frame + summary unchanged;
	 * client-only mount. No semantic colours: allocation is magnitude.
	 */
	function compactPence(pence: number): string {
		return `£${Math.round(Math.abs(pence) / 100).toLocaleString("en-GB")}`;
	}

	const TOP_N = 8;

	let {
		items,
		label = "allocated",
		noun = "goals",
		controls,
	}: {
		items: Array<{ name: string; value: number }>;
		label?: string;
		/** what the shares are (goals, asset classes, …) — used in the summary */
		noun?: string;
		/** optional controls forwarded into the ChartPanel title band */
		controls?: import('svelte').Snippet;
	} = $props();

	const shares = $derived(allocationShares(items));
	const total = $derived(items.reduce((s, i) => s + Math.max(0, i.value), 0));

	// top-N rows + one "Other" aggregate so the trio cell never grows
	// unbounded (10+ goals collapse into 9 rows)
	const rows = $derived.by(() => {
		const top = shares.slice(0, TOP_N);
		if (shares.length > TOP_N) {
			const restValue = shares.slice(TOP_N).reduce((s, r) => s + r.value, 0);
			const restPercent = shares.slice(TOP_N).reduce((s, r) => s + r.percent, 0);
			return [...top.map((s) => ({ name: s.name, value: s.value, percent: s.percent })), { name: `Other (${shares.length - TOP_N} more)`, value: restValue, percent: restPercent }];
		}
		return top.map((s) => ({ name: s.name, value: s.value, percent: s.percent }));
	});

	// deterministic ink-density palette, darkest first (biggest share)
	const SEG_BG = ["#111827", "#374151", "#4b5563", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6", "#f9fafb"];
	const maxV = $derived(Math.max(...rows.map((r) => r.value), 1));

	const series = $derived([
		{
			key: "value",
			label: label,
			value: "value",
			props: { stroke: "#111827", strokeWidth: 0.5 },
		},
	]);

	const summary = $derived(
		shares.length === 0
			? `No ${label} money yet`
			: `${formatCurrency(total)} ${label} across ${shares.length} ${noun} — largest: ${shares[0].name} (${shares[0].percent}%)`,
	);
</script>

<ChartPanel title="Allocation" {summary} {controls}>
	{#if shares.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no allocated money]</div>
	{:else if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="allocation"
			role="img"
			aria-label="Allocation by {noun} as horizontal ink-density bars, interactive; summary below"
		>
			<BarChart
				data={rows}
				y="name"
				c="name"
				cRange={rows.map((_, i) => SEG_BG[i % SEG_BG.length])}
				{series}
				orientation="horizontal"
				height={Math.max(rows.length * 26 + 24, 90)}
				padding={{ top: 6, right: 20, bottom: 24, left: 130 }}
				xDomain={[0, maxV * 1.05]}
				props={{
					xAxis: { format: (v: number) => compactPence(v) },
					tooltip: {
						header: { format: (n: string) => String(n) },
						item: { format: (v: number) => `${formatCurrency(v)} · ${total > 0 ? Math.round((v / total) * 100) : 0}% of ${label}` },
					},
				}}
			/>
		</div>
		<p class="text-[10px] text-gray-600 px-1 pt-1">
			darker = larger share · hover for £ + % of {label}
		</p>
	{/if}
</ChartPanel>
