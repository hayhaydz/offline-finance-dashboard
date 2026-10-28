<script lang="ts">
	import { getMonthName, formatTaxWrapper } from '$lib/utils/formatting';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import TechnicalNote from '$lib/components/TechnicalNote.svelte';
	import type { Snippet } from 'svelte';

	let {
		transactions,
		typeFilter,
		perPage,
		byAccount,
		title,
		emptyMessage,
		technicalNote,
		filterAccountId = $bindable(null),
		filterMonth = $bindable(null),
		filterYear = $bindable(null),
		filterInstitution = $bindable(null),
		filterTaxWrapper = $bindable(null),
		children
	}: {
		transactions: any[];
		typeFilter: (tx: any) => boolean;
		perPage: number;
		byAccount: Array<{ accountId: number; accountName: string }>;
		title: string;
		emptyMessage: string;
		technicalNote: string;
		filterAccountId?: number | null;
		filterMonth?: number | null;
		filterYear?: number | null;
		filterInstitution?: string | null;
		filterTaxWrapper?: string | null;
		children: Snippet<[{ paginatedTransactions: any[] }]>;
	} = $props();

	// Internal state
	// Default: newest first (P1-6, 2026-10-27 audit — the ledger opened
	// oldest-first while the toggle offered "[Newest First]"). Button label
	// always names the action clicking will perform.
	let transactionsSortDesc = $state(true);
	let sectionRef: HTMLElement | null = $state(null);
	const txPagination = useUrlPagination('txPage');

	// Filtered -> sorted -> paginated pipeline
	const filteredTransactions = $derived.by(() => {
		return transactions.filter(tx => {
			if (!typeFilter(tx)) return false;
			if (filterAccountId !== null && tx.accountId !== filterAccountId) return false;
			if (filterMonth !== null && tx.transactionDate.getUTCMonth() + 1 !== filterMonth) return false;
			if (filterYear !== null && tx.transactionDate.getUTCFullYear() !== filterYear) return false;
			if (filterInstitution !== null && tx.accountInstitution !== filterInstitution) return false;
			if (filterTaxWrapper !== null && tx.accountTaxWrapper !== filterTaxWrapper) return false;
			return true;
		});
	});

	const sortedTransactions = $derived.by(() => {
		const txs = [...filteredTransactions];
		if (transactionsSortDesc) txs.reverse();
		return txs;
	});

	const paginatedTransactions = $derived.by(() => {
		const start = txPagination.page * perPage;
		return sortedTransactions.slice(start, start + perPage);
	});

	const totalTransactionPages = $derived(Math.ceil(sortedTransactions.length / perPage));

	// Reset tx page when filters change
	$effect(() => {
		const _ = { filterAccountId, filterMonth, filterYear, filterInstitution, filterTaxWrapper };
		txPagination.page = 0;
		if (filterAccountId !== null || filterMonth !== null || filterInstitution !== null || filterTaxWrapper !== null) {
			const anchor = document.getElementById('transactions-anchor');
			if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
		}
	});

	function clearFilters() {
		filterAccountId = null;
		filterMonth = null;
		filterYear = null;
		filterInstitution = null;
		filterTaxWrapper = null;
	}

	const activeFilterLabel = $derived.by(() => {
		if (filterAccountId !== null) {
			const acc = byAccount.find(a => a.accountId === filterAccountId);
			return `Account: ${acc?.accountName || 'Unknown'}`;
		}
		if (filterMonth !== null && filterYear !== null) {
			return `Month: ${getMonthName(filterMonth)} ${filterYear}`;
		}
		if (filterInstitution !== null) return `Institution: ${filterInstitution}`;
		if (filterTaxWrapper !== null) return `Wrapper: ${formatTaxWrapper(filterTaxWrapper)}`;
		return null;
	});
</script>

<div id="transactions-anchor" bind:this={sectionRef}>
	<SectionHeader title="{title} ({sortedTransactions.length} results)">
		{#snippet action()}
			<div class="flex items-center gap-3">
				{#if activeFilterLabel}
					<div class="flex items-center gap-2">
						<span class="text-[10px] bg-black text-white px-1 font-bold">FILTERED BY {activeFilterLabel.toUpperCase()}</span>
						<button type="button" class="bracket-link text-[10px] font-bold" onclick={clearFilters}>[Clear Filter]</button>
					</div>
				{/if}
				<button type="button" class="bracket-link text-xs" onclick={() => transactionsSortDesc = !transactionsSortDesc}>
					{transactionsSortDesc ? 'Oldest First' : 'Newest First'}
				</button>
			</div>
		{/snippet}
	</SectionHeader>
	{#if sortedTransactions.length === 0}
		<p class="text-gray-600 text-xs p-2 uppercase">{emptyMessage}</p>
	{:else}
		{@render children({ paginatedTransactions })}
		<div class="border-t border-black empty:hidden">
			<PaginationClient page={txPagination.page} totalPages={totalTransactionPages} onPageChange={txPagination.updatePage} scrollTarget={sectionRef} />
		</div>
	{/if}
	<TechnicalNote note={technicalNote} />
</div>
