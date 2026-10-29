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

	// Fall off an empty default view to the first one with data.
	$effect(() => {
		if (active === 'trend' && !hasTrend) {
			const first = views.find((v) => v.available);
			if (first) active = first.id;
		}
	});

	const monthLabel = $derived(
		cashflow
			? new Date(Date.UTC(cashflow.year, cashflow.month - 1, 1)).toLocaleDateString('en-GB', {
					month: 'long',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: ''
	);

	const trendSummary = $derived.by(() => {
		if (trend.length < 2) return 'Not enough snapshots yet';
		const first = trend[0].netWorthInCents;
		const last = trend[trend.length - 1].netWorthInCents;
		const delta = last - first;
		const dir = delta >= 0 ? 'up' : 'down';
		return `Net worth ${dir} ${formatCurrency(Math.abs(delta))} across ${trend.length} snapshots (${trend[0].date} → ${trend[trend.length - 1].date})`;
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
						aria-selected={active === view.id}
						class="bracket-link text-xs"
						class:bg-gray-100={active === view.id}
						class:font-bold={active === view.id}
						onclick={() => (active = view.id)}
					>
						{view.label}
					</button>
				{/if}
			{/each}
		</div>

		{#if active === 'trend' && hasTrend}
			<NetWorthChart points={trend} formatPence={formatCurrency} />
		{:else if active === 'cashflow' && hasCashflow && cashflow}
			<CashflowCalendar
				year={cashflow.year}
				month={cashflow.month}
				obligations={cashflow.obligations}
			/>
		{:else if active === 'allocation' && hasAllocation}
			<AllocationBar items={assetGroups} label="held" />
		{/if}
	</div>
{/if}
