<script lang="ts">
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { formatRate, getExclusionReason } from '$lib/utils/formatting';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';

	type ProjectedAccount = {
		accountSlug: string;
		accountName: string;
		balanceInCents: number;
		rateBasisPoints: number | null;
		daysUntilTaxYearEnd: number;
		maturityDate: Date | null;
		daysUntilMaturity: number | null;
		projectedInterest: number;
		exclusionReason: string | null;
	};

	let {
		accounts,
		totalProjected,
		totalAccountCount,
		projectedPerPage = 10,
	}: {
		accounts: ProjectedAccount[];
		totalProjected: number;
		totalAccountCount: number;
		projectedPerPage?: number;
	} = $props();

	const pagination = useUrlPagination('projectionsPage');
	let sortDesc = $state(true);
	let sectionRef: HTMLElement | null = $state(null);

	const validAccounts = $derived(accounts.filter(a => !a.exclusionReason));

	const sorted = $derived.by(() => {
		const items = [...validAccounts];
		items.sort((a, b) => sortDesc ? b.projectedInterest - a.projectedInterest : a.projectedInterest - b.projectedInterest);
		return items;
	});

	const paginated = $derived(sorted.slice(pagination.page * projectedPerPage, (pagination.page + 1) * projectedPerPage));
	const totalPages = $derived(Math.ceil(sorted.length / projectedPerPage));

	$effect(() => {
		const _ = sortDesc;
		pagination.page = 0;
	});
</script>

<div bind:this={sectionRef} class="border-b border-black">
	<SectionHeader title="Projection Assumptions">
		{#snippet action()}
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => sortDesc = !sortDesc}
			>
				{sortDesc ? 'Low-High' : 'High-Low'}
			</button>
		{/snippet}
	</SectionHeader>
	<div class="overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr class="border-b border-black">
					<th class="pl-2 text-left whitespace-nowrap w-[18%] uppercase text-[10px]">Account</th>
					<th class="text-right pr-2 whitespace-nowrap w-[10%] uppercase text-[10px]">Balance</th>
					<th class="text-right pr-2 whitespace-nowrap w-[8%] uppercase text-[10px]">Rate</th>
					<th class="text-right pr-2 whitespace-nowrap w-[8%] uppercase text-[10px]">Days</th>
					<th class="text-left whitespace-nowrap w-[12%] uppercase text-[10px]">Maturity</th>
					<th class="text-right pr-2 whitespace-nowrap w-[10%] uppercase text-[10px]">Projected</th>
					<th class="text-left whitespace-nowrap uppercase text-[10px]">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each paginated as account}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="pl-2 text-sm py-2 whitespace-nowrap">
							<a href="/accounts/{account.accountSlug}" class="bracket-link text-xs">{account.accountName}</a>
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{formatCurrency(account.balanceInCents)}
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{formatRate(account.rateBasisPoints)}
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{account.exclusionReason ? '-' : account.daysUntilTaxYearEnd}
						</td>
						<td class="text-sm py-2 whitespace-nowrap">
							{#if account.maturityDate}
								{formatDateShorthand(account.maturityDate)}
								{#if account.daysUntilMaturity !== null}
									({account.daysUntilMaturity}d)
								{/if}
							{:else}
								-
							{/if}
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{#if account.exclusionReason}
								<span class="text-gray-600">-</span>
							{:else}
								<div class="flex items-center justify-end gap-1">
									<span class="text-amber-700">+{formatCurrency(account.projectedInterest)}</span>
									<span
										class="text-[10px] text-gray-400 cursor-help font-bold"
										title="{formatCurrency(account.balanceInCents)} * {(account.rateBasisPoints! / 100).toFixed(2)}% * {(account.daysUntilMaturity ?? account.daysUntilTaxYearEnd)} / 365 days"
									>[?]</span>
								</div>
							{/if}
						</td>
						<td class="text-sm py-2">
							{#if account.exclusionReason}
								<span class="text-[10px] text-gray-600 uppercase">{getExclusionReason(account.exclusionReason)}</span>
							{:else}
								<span class="text-[10px] text-green-700 font-bold uppercase">Included</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t border-black">
					<td colspan="5" class="pl-2 text-sm py-2 font-bold uppercase">Total Projected</td>
					<td class="text-right pr-2 text-sm tabular-nums py-2 font-bold text-amber-700">
						{formatCurrency(totalProjected)}
					</td>
					<td class="text-[10px] text-gray-600 py-2 uppercase">
						{validAccounts.length} of {totalAccountCount} accounts
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
	<PaginationClient page={pagination.page} totalPages={totalPages} onPageChange={pagination.updatePage} scrollTarget={sectionRef} />
	<div class="p-2 text-[10px] text-gray-600 border-t border-black uppercase font-mono">
		[TECHNICAL NOTE] Basis: balance * rate * (days / 365). fixed-term accounts project only to maturity date. non-matured fixed-term interest is excluded from taxable totals until maturity.
	</div>
</div>
