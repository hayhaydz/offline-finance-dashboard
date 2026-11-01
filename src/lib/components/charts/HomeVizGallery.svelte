<script lang="ts">
	import NetWorthChart from './NetWorthChart.svelte';
	import AllocationStrip from './AllocationStrip.svelte';
	import { formatCurrency } from '$lib/utils/currency';

	/**
	 * HomeVizGallery (v3 R3 + R30 + v3.2 V2): untitled bento grid of compact
	 * visualisation cells below the home header. Cells are sized differently
	 * (trend wide, allocation narrow) to use the full viewport instead of one
	 * tall stack. Clicking a cell's [+] expands it to full width (R3's click
	 * interaction, kept); [−] restores the grid. No section title (R30).
	 *
	 * v3.2 V2 (2026-11-01): the cashflow calendar moved OUT of the gallery to
	 * the bottom of the home page (user direction) — the gallery is now the
	 * two-cell trend+allocation pair.
	 */
	type ViewId = 'trend' | 'allocation';

	let {
		trend,
		assetGroups
	}: {
		trend: Array<{ date: string; netWorthInCents: number }>;
		assetGroups: Array<{ name: string; value: number }>;
	} = $props();

	const hasTrend = $derived(trend.length > 1);
	const hasAllocation = $derived(assetGroups.some((g) => g.value > 0));

	const cells = $derived([
		{ id: 'trend' as ViewId, available: hasTrend },
		{ id: 'allocation' as ViewId, available: hasAllocation }
	].filter((c) => c.available));

	// Bento spans per cell (relative grid of 3 columns):
	// trend = 2 cols, allocation = 1 col. Expanded cell overrides to full
	// width.
	const SPAN: Record<ViewId, string> = {
		trend: 'col-span-2',
		allocation: 'col-span-1'
	};

	let expanded = $state<ViewId | null>(null);

	function spanFor(id: ViewId): string {
		return expanded === id ? 'col-span-3' : SPAN[id];
	}
</script>

{#if cells.length > 0}
	<!-- v3.1 border system: ChartPanels self-border; wrapper rule removed
	     (was drawing a parallel rule 8px below the cells) -->
	<div class="p-2">
		<div class="grid grid-cols-3 gap-2">
			{#each cells as cell (cell.id)}
				<div class={spanFor(cell.id)} data-viz-cell={cell.id}>
					{#snippet expandControl()}
						<button
							type="button"
							class="bracket-link text-[10px]"
							aria-expanded={expanded === cell.id}
							onclick={() => (expanded = expanded === cell.id ? null : cell.id)}
							title={expanded === cell.id ? 'Restore grid' : 'Expand to full width'}
						>
							{expanded === cell.id ? '−' : '+'}
						</button>
					{/snippet}

					{#if cell.id === 'trend'}
						<NetWorthChart points={trend} formatPence={formatCurrency} aspect="wide">
							{#snippet controls()}{@render expandControl()}{/snippet}
						</NetWorthChart>
					{:else if cell.id === 'allocation'}
						<AllocationStrip items={assetGroups} label="held" noun="asset classes">
							{#snippet controls()}{@render expandControl()}{/snippet}
						</AllocationStrip>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
