<script lang="ts">
	import NetWorthChart from './NetWorthChart.svelte';
	import CashflowCalendar from './CashflowCalendar.svelte';
	import AllocationBar from './AllocationBar.svelte';
	import SectionHeader from '../SectionHeader.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import type { Obligation } from '$lib/utils/surface-views';

	/**
	 * HomeVizGallery (v3 R3): click-to-switch visualisation gallery below
	 * the home header. The v2 header trend chart survives here as view #1
	 * (relocated, not deleted); the v2 cashflow calendar becomes view #2;
	 * asset allocation across account types is view #3. One view at a
	 * time, full width, terminal aesthetic switcher in the section header.
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

	const views = $derived.by(() => [
		{ id: 'trend' as ViewId, label: 'Trend', available: hasTrend },
		{ id: 'cashflow' as ViewId, label: 'Cashflow', available: hasCashflow },
		{ id: 'allocation' as ViewId, label: 'Allocation', available: hasAllocation }
	]);

	const anyAvailable = $derived(views.some((v) => v.available));

	let active = $state<ViewId>('trend');

	// Effective view: falls off an empty default to the first view with
	// data. Derived (not an effect) so SSR resolves it identically.
	const effective = $derived.by(() => {
		if (active === 'trend' && !hasTrend) {
			return views.find((v) => v.available)?.id ?? null;
		}
		return active;
	});
</script>

{#if anyAvailable}
	<SectionHeader title="VISUALISATIONS" />
	<div class="border-b border-black p-2">
		<div class="flex flex-nowrap items-center gap-x-3 mb-2 overflow-x-auto" role="tablist" aria-label="Visualisation type">
			{#each views as view (view.id)}
				{#if view.available}
					<button
						type="button"
						role="tab"
						aria-selected={effective === view.id}
						class="bracket-link text-xs"
						class:bg-gray-100={effective === view.id}
						class:font-bold={effective === view.id}
						onclick={() => (active = view.id)}
					>
						{view.label}
					</button>
				{/if}
			{/each}
		</div>

		{#if effective === 'trend' && hasTrend}
			<NetWorthChart points={trend} formatPence={formatCurrency} />
		{:else if effective === 'cashflow' && hasCashflow && cashflow}
			<CashflowCalendar
				year={cashflow.year}
				month={cashflow.month}
				obligations={cashflow.obligations}
			/>
		{:else if effective === 'allocation' && hasAllocation}
			<AllocationBar items={assetGroups} label="held" />
		{/if}
	</div>
{/if}
