<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { allocationShares } from "$lib/utils/surface-views";

	/**
	 * Goals allocation view (Phase 7 line 2): an on-brand alternative to a
	 * sunburst — a single stacked composition bar (ink-density segments,
	 * darkest = biggest) with a legend listing each goal's share of total
	 * allocated money. No semantic colours: allocation is magnitude.
	 */
	let {
		items,
		label = "allocated",
	}: {
		items: Array<{ name: string; value: number }>;
		label?: string;
	} = $props();

	const shares = $derived(allocationShares(items));
	const total = $derived(items.reduce((s, i) => s + Math.max(0, i.value), 0));
	// deterministic ink-density palette, darkest first (biggest share)
	const SEG_BG = ["#111827", "#4b5563", "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6"];

	const summary = $derived(
		shares.length === 0
			? `No ${label} money yet`
			: `${formatCurrency(total)} ${label} across ${shares.length} goals — largest: ${shares[0].name} (${shares[0].percent}%)`,
	);
</script>

<ChartPanel title="Allocation" {summary}>
	{#if shares.length > 0}
		<div class="p-2">
			<div class="flex h-5 border border-black w-full overflow-hidden" role="img"
				aria-label="Allocation composition bar. {summary}">
				{#each shares as s, i (s.name)}
					{#if s.percent > 0}
						<div
							class="h-full"
							style="width: {s.percent}%; background: {SEG_BG[i % SEG_BG.length]}; border-right: 1px solid #fff;"
							title="{s.name}: {formatCurrency(s.value)} ({s.percent}%)"
						></div>
					{/if}
				{/each}
			</div>
			<div class="flex flex-col gap-0.5 mt-2 text-xs">
				{#each shares as s, i (s.name)}
					<div class="flex items-center gap-2 leading-none">
						<div
							class="w-3 h-3 shrink-0 border border-gray-300"
							style="background: {SEG_BG[i % SEG_BG.length]}"
						></div>
						<span class="truncate flex-1" title={s.name}>{s.name}</span>
						<span class="text-gray-500 w-16 text-right shrink-0"
							>{formatCurrency(s.value)}</span
						>
						<span class="font-bold w-9 text-right shrink-0">{s.percent}%</span>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no allocated money]</div>
	{/if}
</ChartPanel>
