<script lang="ts">
	import { formatCurrency, formatDateRange } from '$lib/utils/currency';
	import ExclusionsModal from '$lib/components/ExclusionsModal.svelte';
	import NetWorthSparkline from '$lib/components/NetWorthSparkline.svelte';
	import type { Account } from '$lib/db/schema';

	type ExclusionsAccount = Pick<Account, 'id' | 'name' | 'type' | 'category' | 'excludedFromNetWorth' | 'taxWrapper'>;

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
		accounts: ExclusionsAccount[];
		/** Last ≤12 snapshots (oldest → newest) for the hero sparkline (#11) */
		trend?: Array<{ date: string; netWorthInCents: number }>;
	}

	let { summary, accounts, trend = [] }: Props = $props();

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

<!-- NET WORTH SECTION — v3.1 A02 design-quality: one band, structured
     stat row (no justify-between dead middles at wide viewports). Content
     model unchanged from the user-mandated revert: title + value, no
     sparkline in the header, same facts in the same order. -->
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1 items-center">
		<h1 class="text-lg font-bold m-0">NET WORTH</h1>
		<div class="flex items-center gap-3">
			{#if trend.length > 1}
				<NetWorthSparkline points={trend} />
			{/if}
			<span class="text-lg font-bold {netWorthColor}">{formatCurrency(summary.netWorth)}</span>
		</div>
	</div>
	<div class="grid grid-cols-3 border-t border-gray-200 mt-1 pt-1">
		<div class="border-r border-black pr-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Total Assets</div>
			<div class="text-lg font-bold {totalAssetsColor}">{formatCurrency(summary.totalAssets)}</div>
			{#if summary.excludedAssets > 0}
				<div class="text-[10px] text-gray-600 mt-1">+ {formatCurrency(summary.excludedAssets)} excluded ({summary.excludedTypeNames.join(', ')})</div>
			{/if}
		</div>
		<div class="border-r border-black px-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Total Liabilities</div>
			<div class="text-lg font-bold text-red-700">{formatCurrency(Math.abs(summary.totalLiabilities))}</div>
			{#if Math.abs(summary.excludedLiabilities) > 0}
				<div class="text-[10px] text-gray-600 mt-1">+ {formatCurrency(Math.abs(summary.excludedLiabilities))} excluded</div>
			{/if}
		</div>
		<div class="pl-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">As of</div>
			<div class="text-sm font-bold text-gray-700 leading-6">{formattedDateRange}</div>
			<div class="text-[10px] text-gray-600 mt-1 flex items-center gap-2">
				<button
					type="button"
					class="bracket-link"
					onclick={openModal}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } }}
				>
					Exclusions: {summary.exclusionCount}
				</button>
				{#if summary.hasStaleData}
					<span class="text-amber-700 font-bold">· some balances &gt;30 days old</span>
				{/if}
			</div>
		</div>
	</div>
	{#if showNeutralColor}
		<div class="text-gray-600 text-xs mt-1">
			{#if allExcluded}
				<span>All account types excluded</span>
			{:else}
				<span>Include account types to see net worth</span>
			{/if}
		</div>
	{/if}
</div>

<!-- MODAL -->
{#if modalOpen}
	<ExclusionsModal open={modalOpen} onClose={closeModal} {accounts} />
{/if}
