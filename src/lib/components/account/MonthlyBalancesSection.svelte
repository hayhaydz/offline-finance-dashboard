<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import PaginationClient from '$lib/components/PaginationClient.svelte';

	type MonthlyBalance = {
		monthKey: string;
		closingBalance: number;
		monthlyNetChange: number;
	};

	let {
		balances,
		pagination,
		totalPages,
		sectionRef,
	}: {
		balances: MonthlyBalance[];
		pagination: { page: number; updatePage: (p: number) => Promise<void> };
		totalPages: number;
		sectionRef: HTMLElement | null;
	} = $props();
</script>

<div bind:this={sectionRef}>
	<div class="bg-gray-100 p-2 font-bold border-y border-black">MONTHLY BALANCE SUMMARY (Derived from Transactions)</div>
	{#if balances.length === 0}
		<p class="text-gray-600 text-xs p-2">No transactions yet. Monthly balance summary will appear automatically.</p>
	{:else}
		<div class="overflow-x-auto">
		<table class="w-full table-fixed min-w-[480px]">
			<thead>
				<tr>
					<th class="pl-2 text-left whitespace-nowrap w-[30%]">Month</th>
					<th class="text-right pr-1 whitespace-nowrap w-[35%]">Closing Balance</th>
					<th class="text-right pr-1 whitespace-nowrap w-[35%]">Net Change</th>
				</tr>
			</thead>
			<tbody>
				{#each balances as balance}
					<tr class="border-b border-gray-200 last:border-b-0 align-top">
						<td class="pl-2 text-sm py-2 whitespace-nowrap">{balance.monthKey}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
							<span class={balance.closingBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
								{formatCurrency(balance.closingBalance)}
							</span>
						</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
							<span class={balance.monthlyNetChange >= 0 ? 'text-green-700' : 'text-red-700'}>
								{balance.monthlyNetChange >= 0 ? '+' : ''}{formatCurrency(balance.monthlyNetChange)}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
		<PaginationClient page={pagination.page} totalPages={totalPages} onPageChange={pagination.updatePage} scrollTarget={sectionRef} />
	{/if}
</div>
