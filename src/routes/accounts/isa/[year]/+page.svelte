<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { formatTaxWrapper, renderProgressBar } from '$lib/utils/formatting';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import BreakdownPanel from '$lib/components/BreakdownPanel.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import StatGrid from '$lib/components/StatGrid.svelte';
	import SystemIntegrityCheck from '$lib/components/SystemIntegrityCheck.svelte';
	import TaxYearNav from '$lib/components/TaxYearNav.svelte';
	import TransactionFilterBar from '$lib/components/TransactionFilterBar.svelte';
	import IsaPacingSection from '$lib/components/isa/IsaPacingSection.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Tab state for breakdown sections
	let activeBreakdown = $state<'account' | 'month' | 'institution' | 'wrapper'>('account');

	// Pagination (URL-synced)
	const breakdownsPagination = useUrlPagination('breakdownsPage');
	const BREAKDOWNS_PER_PAGE = 10;

	// Transaction filtering (shared with TransactionFilterBar via bindable props)
	let filterAccountId = $state<number | null>(null);
	let filterMonth = $state<number | null>(null);
	let filterYear = $state<number | null>(null);
	let filterInstitution = $state<string | null>(null);
	let filterTaxWrapper = $state<string | null>(null);

	// Scroll targets
	let breakdownsSectionRef: HTMLElement | null = $state(null);

	function clearFilters() {
		filterAccountId = null;
		filterMonth = null;
		filterYear = null;
		filterInstitution = null;
		filterTaxWrapper = null;
	}

	// Breakdown sort states
	let accountsSortDesc = $state(true);
	let monthsSortDesc = $state(false);
	let institutionsSortDesc = $state(true);
	let wrappersSortDesc = $state(true);

	// Reset breakdown page when tab or sorts change
	$effect(() => {
		const _ = { activeBreakdown, accountsSortDesc, monthsSortDesc, institutionsSortDesc, wrappersSortDesc };
		breakdownsPagination.page = 0;
	});

	// Breakdown sort + pagination
	const sortedAccounts = $derived.by(() => {
		const items = [...data.actual.byAccount];
		items.sort((a, b) => accountsSortDesc ? b.total - a.total : a.total - b.total);
		return items;
	});
	const sortedMonths = $derived.by(() => {
		const items = [...data.actual.byMonth];
		items.sort((a, b) => {
			if (a.year !== b.year) return monthsSortDesc ? b.year - a.year : a.year - b.year;
			return monthsSortDesc ? b.month - a.month : a.month - b.month;
		});
		return items;
	});
	const sortedInstitutions = $derived.by(() => {
		const items = [...data.actual.byInstitution];
		items.sort((a, b) => institutionsSortDesc ? b.total - a.total : a.total - b.total);
		return items;
	});
	const sortedWrappers = $derived.by(() => {
		const items = [...data.actual.byTaxWrapper];
		items.sort((a, b) => wrappersSortDesc ? b.total - a.total : a.total - b.total);
		return items;
	});

	const bp = $derived(breakdownsPagination.page * BREAKDOWNS_PER_PAGE);
	const paginatedAccounts = $derived(sortedAccounts.slice(bp, bp + BREAKDOWNS_PER_PAGE));
	const paginatedMonths = $derived(sortedMonths.slice(bp, bp + BREAKDOWNS_PER_PAGE));
	const paginatedInstitutions = $derived(sortedInstitutions.slice(bp, bp + BREAKDOWNS_PER_PAGE));
	const paginatedWrappers = $derived(sortedWrappers.slice(bp, bp + BREAKDOWNS_PER_PAGE));

	const totalAccountPages = $derived(Math.ceil(sortedAccounts.length / BREAKDOWNS_PER_PAGE));
	const totalMonthPages = $derived(Math.ceil(sortedMonths.length / BREAKDOWNS_PER_PAGE));
	const totalInstitutionPages = $derived(Math.ceil(sortedInstitutions.length / BREAKDOWNS_PER_PAGE));
	const totalWrapperPages = $derived(Math.ceil(sortedWrappers.length / BREAKDOWNS_PER_PAGE));

	// Tax year nav
	const currentYearSlug = $derived(data.meta.taxYearStart.getUTCFullYear() + '-' + String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2));

	// Integrity check data
	const integrityChecks = $derived([
		{ label: 'Account cross-check', ok: data.reconciliation.totalVsByAccountDelta === 0, detail: data.reconciliation.totalVsByAccountDelta !== 0 ? formatCurrency(data.reconciliation.totalVsByAccountDelta) : undefined },
		{ label: 'Monthly sum validation', ok: data.reconciliation.totalVsByMonthDelta === 0, detail: data.reconciliation.totalVsByMonthDelta !== 0 ? formatCurrency(data.reconciliation.totalVsByMonthDelta) : undefined },
		{ label: 'Transaction reconciliation', ok: data.reconciliation.totalVsTransactionsDelta === 0, detail: data.reconciliation.totalVsTransactionsDelta !== 0 ? formatCurrency(data.reconciliation.totalVsTransactionsDelta) : undefined },
	]);
	const integrityFlags = $derived(data.reconciliation.flags.map(f => `[${f.type.toUpperCase()}] ${f.message}`));

	// Utilization color helper
	const utilizationColor = $derived(
		data.meta.utilizationPercent >= 90 ? 'text-red-700'
			: data.meta.utilizationPercent >= 75 ? 'text-amber-700'
				: 'text-green-700'
	);
	const statusLabel = $derived(
		data.meta.overAllowance ? 'EXCEEDED'
			: data.meta.utilizationPercent >= 90 ? 'NEAR LIMIT'
				: data.meta.utilizationPercent >= 75 ? 'ON TRACK'
					: 'HEALTHY'
	);
	const statusColor = $derived(
		data.meta.overAllowance ? 'text-red-700'
			: data.meta.utilizationPercent >= 90 ? 'text-amber-700'
				: data.meta.utilizationPercent >= 75 ? 'text-yellow-700'
					: 'text-green-700'
	);

	// Breakdown sort label helper
	const breakdownSortLabel = $derived.by(() => {
		if (activeBreakdown === 'account') return accountsSortDesc ? 'Low-High' : 'High-Low';
		if (activeBreakdown === 'month') return monthsSortDesc ? 'Newest-Oldest' : 'Oldest-Newest';
		if (activeBreakdown === 'institution') return institutionsSortDesc ? 'Low-High' : 'High-Low';
		return wrappersSortDesc ? 'Low-High' : 'High-Low';
	});

	function toggleBreakdownSort() {
		if (activeBreakdown === 'account') accountsSortDesc = !accountsSortDesc;
		else if (activeBreakdown === 'month') monthsSortDesc = !monthsSortDesc;
		else if (activeBreakdown === 'institution') institutionsSortDesc = !institutionsSortDesc;
		else wrappersSortDesc = !wrappersSortDesc;
	}
</script>

<!-- HEADER -->
<div class="border-b border-black p-2 flex justify-between items-start">
	<div>
		<h1 class="text-lg font-bold m-0 uppercase">ISA Subscription Breakdown</h1>
		<div class="text-sm text-gray-600 mt-1">
			Tax Year: {data.meta.taxYearStart.getUTCFullYear()}-{String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2)}
		</div>
		<div class="text-xs text-gray-600">
			As of {formatDateShorthand(data.meta.asOfDate)} &bull; {data.meta.daysRemainingInTaxYear} days remaining in tax year
		</div>
	</div>
	<div class="flex flex-col items-end gap-2">
		<div class="flex gap-2 mb-1">
			<a href="/accounts/isa/all" class="bracket-link text-xs">[All Years]</a>
		</div>
		<TaxYearNav availableYears={data.availableTaxYears} currentSlug={currentYearSlug} basePath="/accounts/isa" />
	</div>
</div>

<!-- KPI CARDS -->
<div class="border-b border-black">
	<StatGrid cols={4}>
		<KpiCard
			label="Total Subscribed"
			value={formatCurrency(data.meta.allowanceUsed)}
			color="text-green-700"
			detail="of {formatCurrency(data.meta.allowanceInCents)} allowance"
		/>
		<KpiCard
			label="Allowance Remaining"
			value={formatCurrency(data.meta.allowanceRemaining)}
			color={data.meta.allowanceRemaining > 0 ? 'text-green-700' : 'text-red-700'}
			detail={data.meta.allowanceRemaining > 0 ? 'available to subscribe' : 'allowance exceeded'}
		/>
		<KpiCard
			label="Utilization"
			value={`${data.meta.utilizationPercent}%`}
			color={utilizationColor}
			detail={renderProgressBar(data.meta.allowanceUsed, data.meta.allowanceInCents)}
		/>
		<KpiCard
			label="Status"
			value={statusLabel}
			color={statusColor}
			detail="{data.meta.daysRemainingInTaxYear} days left"
		/>
	</StatGrid>
</div>

<!-- ISA PACING -->
{#if data.pacing}
	<IsaPacingSection pacing={data.pacing} />
{/if}

<!-- BREAKDOWNS -->
<div class="border-b border-black">
	<SectionHeader title="Breakdowns" />
	<BreakdownPanel
		bind:activeTab={activeBreakdown}
		sortLabel={breakdownSortLabel}
		onSortToggle={toggleBreakdownSort}
	>
		{#snippet account()}
			<div bind:this={breakdownsSectionRef}>
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-black">
								<th class="pl-3 text-left whitespace-nowrap uppercase text-[10px]">Account</th>
								<th class="text-left whitespace-nowrap uppercase text-[10px]">Institution</th>
								<th class="text-left whitespace-nowrap uppercase text-[10px]">Wrapper</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Subscribed</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Deposits</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedAccounts as account}
								<tr
									class="border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
									class:bg-black={filterAccountId === account.accountId}
									class:text-white={filterAccountId === account.accountId}
									onclick={() => {
										if (filterAccountId === account.accountId) filterAccountId = null;
										else { clearFilters(); filterAccountId = account.accountId; }
									}}
								>
									<td class="pl-3 text-sm whitespace-nowrap">
										<a href="/accounts/{account.accountSlug}" class="bracket-link text-xs">{account.accountName}</a>
									</td>
									<td class="text-sm whitespace-nowrap">{account.accountInstitution || '-'}</td>
									<td class="text-sm whitespace-nowrap">{formatTaxWrapper(account.accountTaxWrapper)}</td>
									<td class="text-right pr-3 text-sm tabular-nums whitespace-nowrap" class:text-green-700={filterAccountId !== account.accountId}>
										{formatCurrency(account.total)}
									</td>
									<td class="text-right pr-3 text-sm whitespace-nowrap">{account.transactionCount}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t border-black">
								<td colspan="4" class="pl-3 text-sm font-bold uppercase">Total</td>
								<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">{formatCurrency(data.actual.total)}</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalAccountPages} scrollTarget={breakdownsSectionRef} />
			</div>
		{/snippet}

		{#snippet month()}
			<div>
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-black">
								<th class="pl-3 text-left whitespace-nowrap uppercase text-[10px]">Month</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Subscribed</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Deposits</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedMonths as month}
								<tr
									class="border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
									class:bg-black={filterMonth === month.month && filterYear === month.year}
									class:text-white={filterMonth === month.month && filterYear === month.year}
									onclick={() => {
										if (filterMonth === month.month && filterYear === month.year) { filterMonth = null; filterYear = null; }
										else { clearFilters(); filterMonth = month.month; filterYear = month.year; }
									}}
								>
									<td class="pl-3 text-sm whitespace-nowrap">{month.monthName} {month.year}</td>
									<td class="text-right pr-3 text-sm tabular-nums whitespace-nowrap" class:text-green-700={!(filterMonth === month.month && filterYear === month.year)}>
										{formatCurrency(month.total)}
									</td>
									<td class="text-right pr-3 text-sm whitespace-nowrap">{month.transactionCount}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t border-black">
								<td class="pl-3 text-sm font-bold uppercase">Total</td>
								<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">{formatCurrency(data.actual.total)}</td>
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type === 'deposit').length}</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalMonthPages} scrollTarget={breakdownsSectionRef} />
			</div>
		{/snippet}

		{#snippet institution()}
			<div>
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-black">
								<th class="pl-3 text-left whitespace-nowrap uppercase text-[10px]">Institution</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Subscribed</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Deposits</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedInstitutions as inst}
								<tr
									class="border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
									class:bg-black={filterInstitution === inst.institution}
									class:text-white={filterInstitution === inst.institution}
									onclick={() => {
										if (filterInstitution === inst.institution) filterInstitution = null;
										else { clearFilters(); filterInstitution = inst.institution; }
									}}
								>
									<td class="pl-3 text-sm whitespace-nowrap">{inst.institution}</td>
									<td class="text-right pr-3 text-sm tabular-nums whitespace-nowrap" class:text-green-700={filterInstitution !== inst.institution}>
										{formatCurrency(inst.total)}
									</td>
									<td class="text-right pr-3 text-sm whitespace-nowrap">{inst.transactionCount}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t border-black">
								<td class="pl-3 text-sm font-bold uppercase">Total</td>
								<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">{formatCurrency(data.actual.total)}</td>
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type === 'deposit').length}</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalInstitutionPages} scrollTarget={breakdownsSectionRef} />
			</div>
		{/snippet}

		{#snippet wrapper()}
			<div>
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-black">
								<th class="pl-3 text-left whitespace-nowrap uppercase text-[10px]">Tax Wrapper</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Subscribed</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Deposits</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedWrappers as wrap}
								<tr
									class="border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
									class:bg-black={filterTaxWrapper === wrap.taxWrapper}
									class:text-white={filterTaxWrapper === wrap.taxWrapper}
									onclick={() => {
										if (filterTaxWrapper === wrap.taxWrapper) filterTaxWrapper = null;
										else { clearFilters(); filterTaxWrapper = wrap.taxWrapper; }
									}}
								>
									<td class="pl-3 text-sm whitespace-nowrap uppercase">
										{wrap.displayName}
									</td>
									<td class="text-right pr-3 text-sm tabular-nums whitespace-nowrap" class:text-green-700={filterTaxWrapper !== wrap.taxWrapper}>
										{formatCurrency(wrap.total)}
									</td>
									<td class="text-right pr-3 text-sm whitespace-nowrap">{wrap.transactionCount}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t border-black">
								<td class="pl-3 text-sm font-bold uppercase">Total</td>
								<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">{formatCurrency(data.actual.total)}</td>
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type === 'deposit').length}</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalWrapperPages} scrollTarget={breakdownsSectionRef} />
			</div>
		{/snippet}
	</BreakdownPanel>
</div>

<!-- SYSTEM INTEGRITY CHECK -->
<SystemIntegrityCheck checks={integrityChecks} flags={integrityFlags} flagColor="amber" />

<!-- TRANSACTION LEDGER -->
<TransactionFilterBar
	transactions={data.actual.transactions}
	typeFilter={(tx) => tx.type === 'deposit'}
	perPage={25}
	byAccount={data.actual.byAccount}
	title="Tax Year Subscription Record"
	emptyMessage="No ISA subscriptions posted yet."
	technicalNote="Running total shows cumulative ISA subscription since April 6th. Only deposits count toward the £20,000 allowance. Transfers between ISAs are tracked but do not consume additional allowance."
	bind:filterAccountId
	bind:filterMonth
	bind:filterYear
	bind:filterInstitution
	bind:filterTaxWrapper
>
	{#snippet children({ paginatedTransactions })}
		<div class="overflow-x-auto">
			<table class="min-w-[800px] w-full">
				<thead>
					<tr class="border-b border-black">
						<th class="pl-2 text-left whitespace-nowrap w-[12%] uppercase text-[10px]">Date</th>
						<th class="text-left whitespace-nowrap w-[20%] uppercase text-[10px]">Account</th>
						<th class="text-left whitespace-nowrap w-[15%] uppercase text-[10px]">Institution</th>
						<th class="text-left whitespace-nowrap w-[12%] uppercase text-[10px]">Wrapper</th>
						<th class="text-right pr-2 whitespace-nowrap w-[12%] uppercase text-[10px]">Amount</th>
						<th class="text-right pr-2 whitespace-nowrap w-[14%] uppercase text-[10px]">Running Total</th>
						<th class="text-left whitespace-nowrap uppercase text-[10px]">Notes</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedTransactions as tx}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDateShorthand(tx.transactionDate)}</td>
							<td class="text-sm py-2 whitespace-nowrap">
								<a href="/accounts/{tx.accountSlug}" class="bracket-link text-xs">{tx.accountName}</a>
							</td>
							<td class="text-sm py-2 whitespace-nowrap">{tx.accountInstitution || '-'}</td>
							<td class="text-sm py-2 whitespace-nowrap uppercase">{formatTaxWrapper(tx.accountTaxWrapper)}</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
								+{formatCurrency(tx.amount)}
							</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap font-bold">
								{formatCurrency(tx.runningTotal)}
							</td>
							<td class="text-sm py-2 text-gray-600 truncate">{tx.description || '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/snippet}
</TransactionFilterBar>
