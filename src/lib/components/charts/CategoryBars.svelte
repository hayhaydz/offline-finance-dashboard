<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Top categories for a month (Phase 5 line 2): horizontal bars in the
	 * user's category colours (matching the ledger chips), £ values right-
	 * aligned, share-of-month %. Pure CSS, print-safe.
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

	const summary = $derived(
		top.length === 0
			? `No categorised spending in ${month}`
			: `Top: ${top[0].name} (${formatCurrency(top[0].spentPence)}${total > 0 ? `, ${Math.round((top[0].spentPence / total) * 100)}% of ${month}` : ""}) across ${categories.length} categories`,
	);
</script>

<ChartPanel title="Top categories — {month}" {summary}>
	{#if top.length > 0}
		<div class="flex flex-col gap-1 p-1">
			{#each top as cat (cat.name)}
				<div class="flex items-center gap-2 text-xs leading-none">
					<span class="w-28 truncate text-right shrink-0" title={cat.name}>{cat.name}</span>
					<div class="flex-1 h-3 border-y border-gray-100 relative">
						<div
							class="h-full"
							style="width: {(cat.spentPence / maxV) * 100}%; background: {cat.colour};"
						></div>
					</div>
					<span class="w-16 text-right shrink-0 font-bold">{formatCurrency(cat.spentPence)}</span>
					<span class="w-9 text-right shrink-0 text-gray-500"
						>{total > 0 ? Math.round((cat.spentPence / total) * 100) : 0}%</span
					>
				</div>
			{/each}
		</div>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no categorised spending]</div>
	{/if}
</ChartPanel>
