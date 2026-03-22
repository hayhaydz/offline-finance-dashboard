<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	
    let { data } = $props();

	// Pagination state with scroll target
	let tableSectionRef: HTMLElement | null = $state(null);
	let currentPage = $state(data.currentPage);

	// Track if we're updating to prevent loops
	let isUpdatingPage = $state(false);

	// Sync from URL (1-indexed)
	$effect(() => {
		if (isUpdatingPage) return;
		const urlPage = Number(pageState.url.searchParams.get('page')) || 1;
		if (currentPage !== urlPage - 1) {
			currentPage = urlPage - 1;
		}
	});

	async function updatePage(newPage: number) {
		if (isUpdatingPage) return;
		isUpdatingPage = true;
		currentPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('page', String(newPage + 1));
		} else {
			url.searchParams.delete('page');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingPage = false;
	}
</script>

<div class="bg-gray-100 p-2 font-bold border-b border-black flex justify-between items-center">
    <span>INTEREST HISTORY</span>
    <a href="/accounts" class="bracket-link text-xs">[Back to Accounts]</a>
</div>

{#if data.taxYears.length === 0}
    <div class="p-2 text-gray-600 text-sm">No interest history found.</div>
{:else}
<div bind:this={tableSectionRef}>
    <div class="overflow-x-auto">
        <table class="min-w-[550px] w-full">
            <thead>
                <tr>
                    <th class="pl-2 text-left">Tax Year</th>
                    <th class="text-right">ISA Interest</th>
                    <th class="text-right">Taxable Interest</th>
                    <th class="text-left pl-4">Allowance Status</th>
                </tr>
            </thead>
            <tbody>
                {#each data.taxYears as year}
                    <tr class="border-b border-gray-200 last:border-b-0">
                        <td class="pl-2 py-2 text-sm font-bold">
                            <a href="/accounts/interest/{year.slug}" class="bracket-link">{year.label}</a>
                        </td>
                        <td class="text-right py-2 text-sm tabular-nums text-green-700">{formatCurrency(year.isaInterest)}</td>
                        <td class="text-right py-2 text-sm tabular-nums text-green-700">{formatCurrency(year.nonIsaInterest)}</td>
                        <td class="pl-4 py-2 text-sm">
                            {#if year.status.overAllowance}
                                <span class="text-red-700 font-bold">Over by {formatCurrency(year.status.taxableAmount)}</span>
                                <span class="text-xs text-gray-600">({formatCurrency(year.status.allowance)} allowance)</span>
                            {:else}
                                <span class="text-green-700">Within allowance</span>
                                <span class="text-xs text-gray-600">({formatCurrency(year.status.remaining)} left)</span>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <PaginationClient page={currentPage} totalPages={data.totalPages ?? 0} onPageChange={updatePage} scrollTarget={tableSectionRef} />
</div>
{/if}
