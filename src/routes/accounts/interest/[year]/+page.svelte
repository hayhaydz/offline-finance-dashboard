<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { formatTaxWrapper, formatRate, getMonthName, renderProgressBar } from '$lib/utils/formatting';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import BreakdownPanel from '$lib/components/BreakdownPanel.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import StatGrid from '$lib/components/StatGrid.svelte';
	import SystemIntegrityCheck from '$lib/components/SystemIntegrityCheck.svelte';
	import TaxYearNav from '$lib/components/TaxYearNav.svelte';
	import InterestProjectionTable from '$lib/components/interest/InterestProjectionTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Tab state for breakdown sections
	let activeBreakdown = $state<'account' | 'month' | 'institution' | 'wrapper'>('account');

	// Pagination (URL-synced)
	const txPagination = useUrlPagination('txPage');
	const breakdownsPagination = useUrlPagination('breakdownsPage');
	const TRANSACTIONS_PER_PAGE = 10;
	const BREAKDOWNS_PER_PAGE = 10;

	// Transaction filtering
	let filterAccountId = $state<number | null>(null);
	let filterMonth = $state<number | null>(null);
	let filterYear = $state<number | null>(null);
	let filterInstitution = $state<string | null>(null);
	let filterTaxWrapper = $state<string | null>(null);
	let transactionsSortDesc = $state(false);

	// Scroll targets
	let transactionsSectionRef: HTMLElement | null = $state(null);
	let breakdownsSectionRef: HTMLElement | null = $state(null);

	// Filtered → sorted → paginated transaction pipeline
	const filteredTransactions = $derived.by(() => {
		return data.actual.transactions.filter(tx => {
			if (tx.type === 'opening') return false;
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
		const start = txPagination.page * TRANSACTIONS_PER_PAGE;
		return sortedTransactions.slice(start, start + TRANSACTIONS_PER_PAGE);
	});

	const totalTransactionPages = $derived(Math.ceil(sortedTransactions.length / TRANSACTIONS_PER_PAGE));

	// Reset breakdown page when tab or sorts change
	let accountsSortDesc = $state(true);
	let monthsSortDesc = $state(false);
	let institutionsSortDesc = $state(true);
	let wrappersSortDesc = $state(true);

	$effect(() => {
		const _ = { activeBreakdown, accountsSortDesc, monthsSortDesc, institutionsSortDesc, wrappersSortDesc };
		breakdownsPagination.page = 0;
	});

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
			const acc = data.actual.byAccount.find(a => a.accountId === filterAccountId);
			return `Account: ${acc?.accountName || 'Unknown'}`;
		}
		if (filterMonth !== null && filterYear !== null) {
			return `Month: ${getMonthName(filterMonth)} ${filterYear}`;
		}
		if (filterInstitution !== null) return `Institution: ${filterInstitution}`;
		if (filterTaxWrapper !== null) return `Wrapper: ${formatTaxWrapper(filterTaxWrapper)}`;
		return null;
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
		{ label: 'Ledger reconciliation', ok: data.reconciliation.actualVsTransactionsDelta === 0, detail: data.reconciliation.actualVsTransactionsDelta !== 0 ? formatCurrency(data.reconciliation.actualVsTransactionsDelta) : undefined },
		{ label: 'Account cross-check', ok: data.reconciliation.actualVsByAccountDelta === 0, detail: data.reconciliation.actualVsByAccountDelta !== 0 ? formatCurrency(data.reconciliation.actualVsByAccountDelta) : undefined },
		{ label: 'Monthly sum validation', ok: data.reconciliation.actualVsByMonthDelta === 0, detail: data.reconciliation.actualVsByMonthDelta !== 0 ? formatCurrency(data.reconciliation.actualVsByMonthDelta) : undefined },
	]);
	const integrityFlags = $derived(data.reconciliation.flags.map(f => `[${f.type.toUpperCase()}] ${f.message}`));

	// Breakdown sort label helper
	const breakdownSortLabel = $derived.by(() => {
		if (activeBreakdown === 'account') return accountsSortDesc ? 'Low-High' : 'High-Low';
		if (activeBreakdown === 'month') return monthsSortDesc ? 'Old-New' : 'New-Old';
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
		<h1 class="text-lg font-bold m-0 uppercase">Interest Breakdown</h1>
		<div class="text-sm text-gray-600 mt-1">
			Tax Year: {data.meta.taxYearStart.getUTCFullYear()}-{String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2)}
		</div>
		<div class="text-xs text-gray-600">
			As of {formatDateShorthand(data.meta.asOfDate)} &bull; {data.meta.daysRemainingInTaxYear} days remaining in tax year
		</div>
	</div>
	<div class="flex flex-col items-end gap-2">
		<div class="flex gap-2 mb-1">
			<a href="/accounts/interest/all" class="bracket-link text-xs">[All Years]</a>
		</div>
		<TaxYearNav availableYears={data.availableTaxYears} currentSlug={currentYearSlug} basePath="/accounts/interest" />
	</div>
</div>

<!-- KPI CARDS -->
<div class="border-b border-black">
	<StatGrid cols={5}>
		<KpiCard
			label="Posted (Actual)"
			value={formatCurrency(data.actual.total)}
			color="text-green-700"
			detail="TAXABLE: {formatCurrency(data.actual.taxableTotal)}<br>TAX-FREE: {formatCurrency(data.actual.taxFreeTotal)}"
		/>
		<KpiCard
			label="Estimated (Projected)"
			value={formatCurrency(data.projected.total)}
			color="text-amber-700"
			detail="TAXABLE: {formatCurrency(data.projected.taxableTotal)}<br>TAX-FREE: {formatCurrency(data.projected.taxFreeTotal)}"
		/>
		<KpiCard
			label="Forecast (Total)"
			value={formatCurrency(data.forecast.total)}
			detail="ACTUAL + PROJECTED"
		/>
		<KpiCard
			label="PSA Status Now"
			value={data.forecast.psaStatusNow.overAllowance
				? `OVER BY ${formatCurrency(data.forecast.psaStatusNow.taxableAmount)}`
				: `${formatCurrency(data.forecast.psaStatusNow.remaining)} LEFT`}
			color={data.forecast.psaStatusNow.overAllowance ? 'text-red-700' : 'text-green-700'}
			detail="{renderProgressBar(data.forecast.psaStatusNow.used, data.forecast.psaStatusNow.allowance)}<br>OF {formatCurrency(data.forecast.psaStatusNow.allowance)}"
		/>
		<KpiCard
			label="PSA Status Forecast"
			value={data.forecast.psaStatusForecast.overAllowance
				? `OVER BY ${formatCurrency(data.forecast.psaStatusForecast.taxableAmount)}`
				: `${formatCurrency(data.forecast.psaStatusForecast.remaining)} LEFT`}
			color={data.forecast.psaStatusForecast.overAllowance ? 'text-red-700' : 'text-green-700'}
			detail="{renderProgressBar(data.forecast.psaStatusForecast.used, data.forecast.psaStatusForecast.allowance)}<br>AT TAX YEAR END"
		/>
	</StatGrid>
</div>

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
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Interest Earned</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Trans.</th>
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
									<td class="pl-3 text-sm whitespace-nowrap">{account.accountName}</td>
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
								<td colspan="3" class="pl-3 text-sm font-bold uppercase">Total</td>
								<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">{formatCurrency(data.actual.total)}</td>
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
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
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Interest Earned</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Trans.</th>
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
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
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
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Interest Earned</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Trans.</th>
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
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
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
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Interest Earned</th>
								<th class="text-right pr-3 whitespace-nowrap uppercase text-[10px]">Trans.</th>
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
										{formatTaxWrapper(wrap.taxWrapper)}
										{#if wrap.isTaxFree}
											<span class="ml-1 text-[10px] font-bold" class:text-green-700={filterTaxWrapper !== wrap.taxWrapper}>[TAX-FREE]</span>
										{/if}
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
								<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalWrapperPages} scrollTarget={breakdownsSectionRef} />
			</div>
		{/snippet}
	</BreakdownPanel>
</div>

<!-- PROJECTION ASSUMPTIONS -->
<InterestProjectionTable
	accounts={data.projected.byAccount}
	totalProjected={data.projected.total}
	totalAccountCount={data.projected.byAccount.length}
/>

<!-- SYSTEM INTEGRITY CHECK -->
<SystemIntegrityCheck checks={integrityChecks} flags={integrityFlags} />

<!-- TRANSACTION LEDGER -->
<div id="transactions-anchor" bind:this={transactionsSectionRef}>
	<SectionHeader title="Tax Year Interest Record ({sortedTransactions.length} results)">
		{#snippet action()}
			<div class="flex items-center gap-3">
				{#if activeFilterLabel}
					<div class="flex items-center gap-2">
						<span class="text-[10px] bg-black text-white px-1 font-bold">FILTERED BY {activeFilterLabel.toUpperCase()}</span>
						<button type="button" class="bracket-link text-[10px] font-bold" onclick={clearFilters}>[Clear Filter]</button>
					</div>
				{/if}
				<button
					type="button"
					class="bracket-link text-xs"
					onclick={() => transactionsSortDesc = !transactionsSortDesc}
				>
					{transactionsSortDesc ? 'Oldest First' : 'Newest First'}
				</button>
			</div>
		{/snippet}
	</SectionHeader>
	{#if sortedTransactions.length === 0}
		<p class="text-gray-600 text-xs p-2 uppercase">No interest transactions posted yet.</p>
	{:else}
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
						<tr class="border-b border-gray-200 last:border-b-0" class:bg-gray-50={tx.type === 'opening'}>
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDateShorthand(tx.transactionDate)}</td>
							<td class="text-sm py-2 whitespace-nowrap">
								<a href="/accounts/{tx.accountSlug}" class="bracket-link text-xs">{tx.accountName}</a>
							</td>
							<td class="text-sm py-2 whitespace-nowrap">{tx.accountInstitution || '-'}</td>
							<td class="text-sm py-2 whitespace-nowrap uppercase">{formatTaxWrapper(tx.accountTaxWrapper)}</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap" class:text-green-700={tx.amount > 0} class:text-gray-400={tx.amount === 0}>
								{tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
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
		<div class="border-t border-black empty:hidden">
			<PaginationClient page={txPagination.page} totalPages={totalTransactionPages} onPageChange={txPagination.updatePage} scrollTarget={transactionsSectionRef} />
		</div>
	{/if}
	<div class="p-2 text-[10px] text-gray-600 border-t border-black uppercase font-mono">
		[TECHNICAL NOTE] Running total includes all interest posted since April 6th. Opening balance rows represent the starting state for each account in this tax year.
	</div>
</div>
