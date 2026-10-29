<script lang="ts">
	import NetWorthChart from './NetWorthChart.svelte';
	import CashflowCalendar from './CashflowCalendar.svelte';
	import AllocationBar from './AllocationBar.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import type { Obligation } from '$lib/utils/surface-views';

	/**
	 * HomeVizGallery (v3 R3 + R30): untitled bento grid of compact
	 * visualisation cells below the home header. Cells are sized
	 * differently (trend wide, allocation narrow, cashflow full-width)
	 * to use the full viewport instead of one tall stack. Clicking a
	 * cell's [+] expands it to full width (R3's click interaction,
	 * kept); [−] restores the grid. No section title (R30).
	 */
	type ViewId = 'trend' | 'cashflow' | 'allocation';

	let {
		trend,
		cashflow,
		assetGroups
	}: {
		trend: Array<{ date: string; netWorthInCents: number }>;
		cashflow: { year: number; month: number; obligations: Obligation[] } | null;
		assetGroups: Array<{ name: string; value: number }>;
	} = $props();

	const hasTrend = $derived(trend.length > 1);
	const hasCashflow = $derived((cashflow?.obligations?.length ?? 0) > 0);
	const hasAllocation = $derived(assetGroups.some((g) => g.value > 0));

	const cells = $derived([
		{ id: 'trend' as ViewId, available: hasTrend },
		{ id: 'cashflow' as ViewId, available: hasCashflow },
		{ id: 'allocation' as ViewId, available: hasAllocation }
	].filter((c) => c.available));

	// Bento spans per cell (relative grid of 3 columns):
	// trend = 2 cols, allocation = 1 col, cashflow = 3 cols (wide month
	// grid). Expanded cell overrides to full width.
	const SPAN: Record<ViewId, string> = {
		trend: 'col-span-2',
		cashflow: 'col-span-3',
		allocation: 'col-span-1'
	};

	let expanded = $state<ViewId | null>(null);

	function spanFor(id: ViewId): string {
		return expanded === id ? 'col-span-3' : SPAN[id];
	}
</script>

{#if cells.length > 0}
	<div class="border-b border-black p-2">
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
					{:else if cell.id === 'cashflow' && cashflow}
						<CashflowCalendar
							year={cashflow.year}
							month={cashflow.month}
							obligations={cashflow.obligations}
						>
							{#snippet controls()}{@render expandControl()}{/snippet}
						</CashflowCalendar>
					{:else if cell.id === 'allocation'}
						<AllocationBar items={assetGroups} label="held" noun="asset classes">
							{#snippet controls()}{@render expandControl()}{/snippet}
						</AllocationBar>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
