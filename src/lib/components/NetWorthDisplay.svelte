<script lang="ts">
	import { formatCurrency, formatDateRange } from '$lib/utils/currency';
	import ExclusionsModal from '$lib/components/ExclusionsModal.svelte';

	interface Account {
		id: number;
		name: string;
		type: string;
		category: 'asset' | 'liability';
		excludedFromNetWorth: boolean;
		taxWrapper: string;
	}

	interface NetWorthSummary {
		netWorth: number;
		totalAssets: number;
		totalLiabilities: number;
		excludedAssets: number;
		excludedLiabilities: number;
		exclusionCount: number;
		excludedTypeNames: string[];
		hasStaleData: boolean;
		dateRange: { oldest: Date; newest: Date };
	}

	interface Props {
		summary: NetWorthSummary;
		accounts: Account[];
	}

	let { summary, accounts }: Props = $props();

	let modalOpen = $state(false);

	const netWorthColor = $derived(
		(summary.netWorth === 0 && summary.totalAssets === 0 && summary.totalLiabilities === 0)
			? ''
			: (summary.netWorth >= 0 ? 'text-green-700' : 'text-red-700')
	);

	const totalAssetsColor = $derived(summary.totalAssets >= 0 ? 'text-green-700' : 'text-red-700');

	const formattedDateRange = $derived(
		formatDateRange(summary.dateRange.oldest, summary.dateRange.newest)
	);

	const showNeutralColor = $derived(
		summary.netWorth === 0 && summary.totalAssets === 0 && summary.totalLiabilities === 0
	);

	const allExcluded = $derived(showNeutralColor && summary.exclusionCount > 0);

	const hasExclusions = $derived(
		summary.excludedAssets > 0 || Math.abs(summary.excludedLiabilities) > 0
	);

	function openModal() {
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && modalOpen) {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- NET WORTH SECTION -->
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1">
		<span class="text-lg font-bold">NET WORTH</span>
		<span class="text-lg font-bold {netWorthColor}">{formatCurrency(summary.netWorth)}</span>
	</div>
	<div class="flex justify-between my-1 text-gray-600 text-xs">
		<button
			type="button"
			class="bracket-link"
			onclick={openModal}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } }}
		>
			Exclusions: {summary.exclusionCount}
		</button>
		<span>{formattedDateRange}</span>
	</div>
	{#if summary.hasStaleData}
		<div class="flex justify-between my-1 text-amber-700 text-xs">
			<span></span>
			<span>Some balances >30 days old</span>
		</div>
	{/if}
	{#if showNeutralColor}
		<div class="flex justify-between my-1 text-gray-600 text-xs">
			<span></span>
			{#if allExcluded}
				<span>All account types excluded</span>
			{:else}
				<span>Include account types to see net worth</span>
			{/if}
		</div>
	{/if}
</div>

<!-- BREAKDOWN SECTION -->
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1">
		<span>Total Assets</span>
		<span class="{totalAssetsColor} font-bold">{formatCurrency(summary.totalAssets)}</span>
	</div>
	{#if summary.excludedAssets > 0}
		<div class="flex justify-between my-1 text-gray-600 text-xs">
			<span>Assets excluded ({summary.excludedTypeNames.join(', ')})</span>
			<span>{formatCurrency(summary.excludedAssets)}</span>
		</div>
	{/if}
	<div class="flex justify-between my-1">
		<span>Total Liabilities</span>
		<span class="text-red-700 font-bold">{formatCurrency(Math.abs(summary.totalLiabilities))}</span>
	</div>
	{#if Math.abs(summary.excludedLiabilities) > 0}
		<div class="flex justify-between my-1 text-gray-600 text-xs">
			<span>Liabilities excluded ({summary.excludedTypeNames.join(', ')})</span>
			<span>{formatCurrency(Math.abs(summary.excludedLiabilities))}</span>
		</div>
	{/if}
</div>

<!-- MODAL -->
{#if modalOpen}
	<ExclusionsModal open={modalOpen} onClose={closeModal} {accounts} />
{/if}
