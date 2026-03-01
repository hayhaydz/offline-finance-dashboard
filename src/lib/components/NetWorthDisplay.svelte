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

	interface DateRange {
		oldest: Date;
		newest: Date;
	}

	interface Props {
		netWorth: number;
		totalAssets: number;
		totalLiabilities: number;
		excludedAssets: number;
		excludedLiabilities: number;
		dateRange: DateRange;
		hasStaleData: boolean;
		exclusionCount: number;
		accounts: Account[];
	}

	let {
		netWorth,
		totalAssets,
		totalLiabilities,
		excludedAssets,
		excludedLiabilities,
		dateRange,
		hasStaleData,
		exclusionCount,
		accounts
	}: Props = $props();

	let modalOpen = $state(false);

	const netWorthColor = $derived(
		(netWorth === 0 && totalAssets === 0 && totalLiabilities === 0)
			? ''
			: (netWorth >= 0 ? 'text-green-700' : 'text-red-700')
	);

	const totalAssetsColor = $derived(totalAssets >= 0 ? 'text-green-700' : 'text-red-700');

	const formattedDateRange = $derived(formatDateRange(dateRange.oldest, dateRange.newest));

	const showNeutralColor = $derived(
		netWorth === 0 && totalAssets === 0 && totalLiabilities === 0
	);

	const allExcluded = $derived(showNeutralColor && exclusionCount > 0);

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
		<span class="text-lg font-bold {netWorthColor}">{formatCurrency(netWorth)}</span>
	</div>
	<div class="flex justify-between my-1 text-gray-600 text-xs">
		<button
			type="button"
			class="bracket-link"
			onclick={openModal}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } }}
		>
			Exclusions: {exclusionCount}
		</button>
		<span>{formattedDateRange}</span>
	</div>
	{#if hasStaleData}
		<div class="flex justify-between my-1 text-amber-700 text-xs">
			<span></span>
			<span>⚠ Some balances >30 days old</span>
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
		<span class="{totalAssetsColor} font-bold">{formatCurrency(totalAssets)}</span>
	</div>
	{#if excludedAssets > 0}
		<div class="flex justify-between my-1 text-gray-600">
			<span>Assets excluded</span>
			<span>{formatCurrency(excludedAssets)}</span>
		</div>
	{/if}
	<div class="flex justify-between my-1">
		<span>Total Liabilities</span>
		<span class="text-red-700 font-bold">{formatCurrency(Math.abs(totalLiabilities))}</span>
	</div>
	{#if Math.abs(excludedLiabilities) > 0}
		<div class="flex justify-between my-1 text-gray-600">
			<span>Liabilities excluded</span>
			<span>{formatCurrency(Math.abs(excludedLiabilities))}</span>
		</div>
	{/if}
</div>

<!-- MODAL -->
{#if modalOpen}
	<ExclusionsModal open={modalOpen} onClose={closeModal} {accounts} />
{/if}
