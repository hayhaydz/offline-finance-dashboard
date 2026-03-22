<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Tab/accordion state for breakdown sections
	let activeBreakdown = $state<'account' | 'month' | 'institution' | 'wrapper'>('account');

	// Helper function to format date range
	function formatDateRange(start: Date, end: Date): string {
		const startStr = formatDateShorthand(start);
		const endStr = formatDateShorthand(end);
		return `${startStr} to ${endStr}`;
	}

	// Helper function to format tax wrapper display
	function formatTaxWrapper(wrapper: string): string {
		if (wrapper === 'none') return 'None';
		return wrapper.toUpperCase();
	}

	// Helper function to get exclusion reason display
	function getExclusionReason(reason: string | null): string {
		const reasons: Record<string, string> = {
			no_balance: 'No balance',
			no_rate: 'No rate set',
			already_matured: 'Already matured',
			matures_after_tax_year: 'Matures after tax year end',
			closed_account: 'Account closed',
			non_interest_bearing: 'Not interest-bearing'
		};
		return reasons[reason || ''] || reason || 'Included';
	}

	// Helper to format rate for display
	function formatRate(basisPoints: number | null): string {
		if (basisPoints === null) return '-';
		return `${(basisPoints / 100).toFixed(2)}%`;
	}

	// Pagination state for transactions
	let transactionsPage = $state(0);
	const TRANSACTIONS_PER_PAGE = 25;

	// Filtering state for transactions
	let filterAccountId = $state<number | null>(null);
	let filterMonth = $state<number | null>(null); // 1-12
	let filterYear = $state<number | null>(null);
	let filterInstitution = $state<string | null>(null);
	let filterTaxWrapper = $state<string | null>(null);

	// Sort state for transactions (default: date ascending)
	let transactionsSortDesc = $state(false);

	// Scroll targets for pagination
	let transactionsSectionRef: HTMLElement | null = $state(null);
	let breakdownsSectionRef: HTMLElement | null = $state(null);
	let projectionsSectionRef: HTMLElement | null = $state(null);

	// Track if we're updating to prevent loops
	let isUpdatingTransactionsPage = $state(false);
	let isUpdatingBreakdownsPage = $state(false);
	let isUpdatingProjectionsPage = $state(false);

	// Derived filtered transactions
	const filteredTransactions = $derived.by(() => {
		return data.actual.transactions.filter(tx => {
			if (tx.type === 'opening') return false; // Usually don't filter opening balances or hide them when filtering
			
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
		if (transactionsSortDesc) {
			txs.reverse();
		}
		return txs;
	});

	// Paginated transactions
	const paginatedTransactions = $derived.by(() => {
		const start = transactionsPage * TRANSACTIONS_PER_PAGE;
		const end = start + TRANSACTIONS_PER_PAGE;
		return sortedTransactions.slice(start, end);
	});

	const totalTransactionPages = $derived(Math.ceil(sortedTransactions.length / TRANSACTIONS_PER_PAGE));

	// Breakdown pagination state
	let breakdownsPage = $state(0);
	const BREAKDOWNS_PER_PAGE = 10;

	// Reset breakdown page when tab changes or sorts change
	$effect(() => {
		const _ = { activeBreakdown, accountsSortDesc, monthsSortDesc, institutionsSortDesc, wrappersSortDesc };
		breakdownsPage = 0;
	});

	// Projection pagination state
	let projectionsPage = $state(0);
	const PROJECTIONS_PER_PAGE = 10;

	// Reset projection page when sort changes
	$effect(() => {
		const _ = projectedAccountsSortDesc;
		projectionsPage = 0;
	});

	// Sync pagination state with URL (1-indexed)
	$effect(() => {
		if (isUpdatingBreakdownsPage) return;
		const urlBreakdownsPage = Number(pageState.url.searchParams.get('breakdownsPage')) || 1;
		if (breakdownsPage !== urlBreakdownsPage - 1) breakdownsPage = urlBreakdownsPage - 1;

		if (isUpdatingProjectionsPage) return;
		const urlProjectionsPage = Number(pageState.url.searchParams.get('projectionsPage')) || 1;
		if (projectionsPage !== urlProjectionsPage - 1) projectionsPage = urlProjectionsPage - 1;

		if (isUpdatingTransactionsPage) return;
		const urlTransactionsPage = Number(pageState.url.searchParams.get('txPage')) || 1;
		if (transactionsPage !== urlTransactionsPage - 1) transactionsPage = urlTransactionsPage - 1;
	});

	async function updateBreakdownsPage(newPage: number) {
		if (isUpdatingBreakdownsPage) return;
		isUpdatingBreakdownsPage = true;
		breakdownsPage = newPage;
		const url = new URL(pageState.url);
		url.searchParams.set('breakdownsPage', String(newPage + 1));
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingBreakdownsPage = false;
	}

	async function updateProjectionsPage(newPage: number) {
		if (isUpdatingProjectionsPage) return;
		isUpdatingProjectionsPage = true;
		projectionsPage = newPage;
		const url = new URL(pageState.url);
		url.searchParams.set('projectionsPage', String(newPage + 1));
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingProjectionsPage = false;
	}

	async function updateTransactionsPage(newPage: number) {
		if (isUpdatingTransactionsPage) return;
		isUpdatingTransactionsPage = true;
		transactionsPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('txPage', String(newPage + 1));
		} else {
			url.searchParams.delete('txPage');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingTransactionsPage = false;
	}

	// Reset page when filters change
	$effect(() => {
		// This effect will run whenever any filter changes
		const _ = { filterAccountId, filterMonth, filterYear, filterInstitution, filterTaxWrapper };
		transactionsPage = 0;
		
		// Scroll to transactions if a filter was applied
		if (filterAccountId !== null || filterMonth !== null || filterInstitution !== null || filterTaxWrapper !== null) {
			const anchor = document.getElementById('transactions-anchor');
			if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
		}
	});

	// Helper function to get month name
	function getMonthName(month: number): string {
		const names = [
			'January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'
		];
		return names[month - 1] || 'Unknown';
	}

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
		if (filterInstitution !== null) {
			return `Institution: ${filterInstitution}`;
		}
		if (filterTaxWrapper !== null) {
			return `Wrapper: ${formatTaxWrapper(filterTaxWrapper)}`;
		}
		return null;
	});

	// Sort state for account breakdown (default: amount descending)
	let accountsSortDesc = $state(true);
	const sortedAccounts = $derived.by(() => {
		const accounts = [...data.actual.byAccount];
		accounts.sort((a, b) => accountsSortDesc ? b.total - a.total : a.total - b.total);
		return accounts;
	});

	const paginatedAccounts = $derived(sortedAccounts.slice(breakdownsPage * BREAKDOWNS_PER_PAGE, (breakdownsPage + 1) * BREAKDOWNS_PER_PAGE));
	const totalAccountPages = $derived(Math.ceil(sortedAccounts.length / BREAKDOWNS_PER_PAGE));

	// Sort state for month breakdown (default: chronological)
	let monthsSortDesc = $state(false);
	const sortedMonths = $derived.by(() => {
		const months = [...data.actual.byMonth];
		months.sort((a, b) => {
			if (a.year !== b.year) return monthsSortDesc ? b.year - a.year : a.year - b.year;
			return monthsSortDesc ? b.month - a.month : a.month - b.month;
		});
		return months;
	});

	const paginatedMonths = $derived(sortedMonths.slice(breakdownsPage * BREAKDOWNS_PER_PAGE, (breakdownsPage + 1) * BREAKDOWNS_PER_PAGE));
	const totalMonthPages = $derived(Math.ceil(sortedMonths.length / BREAKDOWNS_PER_PAGE));

	// Sort state for institution breakdown (default: amount descending)
	let institutionsSortDesc = $state(true);
	const sortedInstitutions = $derived.by(() => {
		const institutions = [...data.actual.byInstitution];
		institutions.sort((a, b) => institutionsSortDesc ? b.total - a.total : a.total - b.total);
		return institutions;
	});

	const paginatedInstitutions = $derived(sortedInstitutions.slice(breakdownsPage * BREAKDOWNS_PER_PAGE, (breakdownsPage + 1) * BREAKDOWNS_PER_PAGE));
	const totalInstitutionPages = $derived(Math.ceil(sortedInstitutions.length / BREAKDOWNS_PER_PAGE));

	// Sort state for wrapper breakdown (default: amount descending)
	let wrappersSortDesc = $state(true);
	const sortedWrappers = $derived.by(() => {
		const wrappers = [...data.actual.byTaxWrapper];
		wrappers.sort((a, b) => wrappersSortDesc ? b.total - a.total : a.total - b.total);
		return wrappers;
	});

	const paginatedWrappers = $derived(sortedWrappers.slice(breakdownsPage * BREAKDOWNS_PER_PAGE, (breakdownsPage + 1) * BREAKDOWNS_PER_PAGE));
	const totalWrapperPages = $derived(Math.ceil(sortedWrappers.length / BREAKDOWNS_PER_PAGE));

	// Filter to only show valid interest-bearing accounts (excluded accounts are not relevant for projection display)
	const validProjectedAccounts = $derived.by(() => {
		return data.projected.byAccount.filter(account => !account.exclusionReason);
	});

	// Sort state for projected accounts (default: amount descending)
	let projectedAccountsSortDesc = $state(true);
	const sortedProjectedAccounts = $derived.by(() => {
		const accounts = [...validProjectedAccounts];
		accounts.sort((a, b) => projectedAccountsSortDesc ? b.projectedInterest - a.projectedInterest : a.projectedInterest - b.projectedInterest);
		return accounts;
	});

	const paginatedProjectedAccounts = $derived(sortedProjectedAccounts.slice(projectionsPage * PROJECTIONS_PER_PAGE, (projectionsPage + 1) * PROJECTIONS_PER_PAGE));
	const totalProjectedPages = $derived(Math.ceil(sortedProjectedAccounts.length / PROJECTIONS_PER_PAGE));

	// Tax year selector logic
	const currentYearSlug = $derived(data.meta.taxYearStart.getUTCFullYear() + '-' + String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2));
	
	const currentIndex = $derived(data.availableTaxYears.findIndex(ty => ty.slug === currentYearSlug));
	
	const prevYear = $derived(currentIndex < data.availableTaxYears.length - 1 ? data.availableTaxYears[currentIndex + 1] : null);
	const nextYear = $derived(currentIndex > 0 ? data.availableTaxYears[currentIndex - 1] : null);

	// Helper for ASCII progress bar
	function renderProgressBar(used: number, limit: number, width = 10): string {
		const ratio = Math.min(1, used / limit);
		const filled = Math.round(ratio * width);
		const empty = width - filled;
		return `[${'#'.repeat(filled)}${'.'.repeat(empty)}] ${Math.round(ratio * 100)}%`;
	}
</script>

<!-- HEADER SECTION -->
<div class="border-b border-black p-2 flex justify-between items-start">
	<div>
		<h1 class="text-lg font-bold m-0 uppercase">Interest Breakdown</h1>
		<div class="text-sm text-gray-600 mt-1">
			Tax Year: {data.meta.taxYearStart.getUTCFullYear()}-{String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2)}
		</div>
		<div class="text-xs text-gray-600">
			As of {formatDateShorthand(data.meta.asOfDate)} • {data.meta.daysRemainingInTaxYear} days remaining in tax year
		</div>
	</div>
	<div class="flex flex-col items-end gap-2">
		<div class="flex gap-2 mb-1">
			<a href="/accounts/interest" class="bracket-link text-xs">[All Years]</a>
		</div>
		<div class="text-[10px] uppercase font-bold text-gray-600">Tax Year</div>
		<div class="flex gap-1 items-center">
			{#if prevYear}
				<a href="/accounts/interest/{prevYear.slug}" class="bracket-link text-xs" data-sveltekit-noscroll>[Prev]</a>
			{/if}
			<span class="bracket-link bg-black text-white text-xs px-1">{currentYearSlug}</span>
			{#if nextYear}
				<a href="/accounts/interest/{nextYear.slug}" class="bracket-link text-xs" data-sveltekit-noscroll>[Next]</a>
			{/if}
		</div>
	</div>
</div>

<!-- KPI CARDS SECTION -->
<div class="border-b border-black">
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
		<!-- Posted (Actual) -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Posted (Actual)</div>
			<div class="text-lg font-bold text-green-700">{formatCurrency(data.actual.total)}</div>
			<div class="text-[10px] text-gray-600 mt-1">
				TAXABLE: {formatCurrency(data.actual.taxableTotal)}<br>
				TAX-FREE: {formatCurrency(data.actual.taxFreeTotal)}
			</div>
		</div>

		<!-- Estimated (Projected) -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Estimated (Projected)</div>
			<div class="text-lg font-bold text-amber-700">{formatCurrency(data.projected.total)}</div>
			<div class="text-[10px] text-gray-600 mt-1">
				TAXABLE: {formatCurrency(data.projected.taxableTotal)}<br>
				TAX-FREE: {formatCurrency(data.projected.taxFreeTotal)}
			</div>
		</div>

		<!-- Forecast (Tax Year Total) -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Forecast (Total)</div>
			<div class="text-lg font-bold">{formatCurrency(data.forecast.total)}</div>
			<div class="text-[10px] text-gray-600 mt-1 uppercase">
				ACTUAL + PROJECTED
			</div>
		</div>

		<!-- PSA Status Now -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">PSA Status Now</div>
			{#if data.forecast.psaStatusNow.overAllowance}
				<div class="text-sm font-bold text-red-700">
					OVER BY {formatCurrency(data.forecast.psaStatusNow.taxableAmount)}
				</div>
			{:else}
				<div class="text-sm font-bold text-green-700">
					{formatCurrency(data.forecast.psaStatusNow.remaining)} LEFT
				</div>
			{/if}
			<div class="text-[10px] font-mono mt-1 text-gray-600">
				{renderProgressBar(data.forecast.psaStatusNow.used, data.forecast.psaStatusNow.allowance)}<br>
				OF {formatCurrency(data.forecast.psaStatusNow.allowance)}
			</div>
		</div>

		<!-- PSA Status Forecast -->
		<div class="p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">PSA Status Forecast</div>
			{#if data.forecast.psaStatusForecast.overAllowance}
				<div class="text-sm font-bold text-red-700">
					OVER BY {formatCurrency(data.forecast.psaStatusForecast.taxableAmount)}
				</div>
			{:else}
				<div class="text-sm font-bold text-green-700">
					{formatCurrency(data.forecast.psaStatusForecast.remaining)} LEFT
				</div>
			{/if}
			<div class="text-[10px] font-mono mt-1 text-gray-600">
				{renderProgressBar(data.forecast.psaStatusForecast.used, data.forecast.psaStatusForecast.allowance)}<br>
				AT TAX YEAR END
			</div>
		</div>
	</div>
</div>

<!-- BREAKDOWN SECTIONS -->
<div class="border-b border-black">
	<div class="p-2 font-bold uppercase">Breakdowns</div>

	<!-- Tab buttons (Bracket style) -->
	<div class="flex justify-between items-center border-b border-black p-2 gap-2">
		<div class="flex gap-2">
			<button
				type="button"
				class="bracket-link text-xs"
				class:bg-black={activeBreakdown === 'account'}
				class:text-white={activeBreakdown === 'account'}
				onclick={() => activeBreakdown = 'account'}
			>
				By Account
			</button>
			<button
				type="button"
				class="bracket-link text-xs"
				class:bg-black={activeBreakdown === 'month'}
				class:text-white={activeBreakdown === 'month'}
				onclick={() => activeBreakdown = 'month'}
			>
				By Month
			</button>
			<button
				type="button"
				class="bracket-link text-xs"
				class:bg-black={activeBreakdown === 'institution'}
				class:text-white={activeBreakdown === 'institution'}
				onclick={() => activeBreakdown = 'institution'}
			>
				By Institution
			</button>
			<button
				type="button"
				class="bracket-link text-xs"
				class:bg-black={activeBreakdown === 'wrapper'}
				class:text-white={activeBreakdown === 'wrapper'}
				onclick={() => activeBreakdown = 'wrapper'}
			>
				By Tax Wrapper
			</button>
		</div>
		<button
			type="button"
			class="bracket-link text-xs"
			onclick={() => accountsSortDesc = !accountsSortDesc}
		>
			{accountsSortDesc ? 'Low-High' : 'High-Low'}
		</button>
	</div>

	<!-- Account Breakdown -->
	{#if activeBreakdown === 'account'}
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
								<td class="pl-3 text-sm whitespace-nowrap">
									{account.accountName}
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
							<td colspan="3" class="pl-3 text-sm font-bold uppercase">Total</td>
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPage} onPageChange={updateBreakdownsPage} totalPages={totalAccountPages} scrollTarget={breakdownsSectionRef} />
		</div>
	{/if}

	<!-- Month Breakdown -->
	{#if activeBreakdown === 'month'}
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPage} onPageChange={updateBreakdownsPage} totalPages={totalMonthPages} scrollTarget={breakdownsSectionRef} />
		</div>
	{/if}

	<!-- Institution Breakdown -->
	{#if activeBreakdown === 'institution'}
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPage} onPageChange={updateBreakdownsPage} totalPages={totalInstitutionPages} scrollTarget={breakdownsSectionRef} />
		</div>
	{/if}

	<!-- Tax Wrapper Breakdown -->
	{#if activeBreakdown === 'wrapper'}
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type !== 'opening').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPage} onPageChange={updateBreakdownsPage} totalPages={totalWrapperPages} scrollTarget={breakdownsSectionRef} />
		</div>
	{/if}
</div>

<!-- PROJECTION ASSUMPTIONS TABLE -->
<div bind:this={projectionsSectionRef} class="border-b border-black">
	<div class="p-2 font-bold flex justify-between items-center uppercase">
		<span>Projection Assumptions</span>
		<button
			type="button"
			class="bracket-link text-xs"
			onclick={() => projectedAccountsSortDesc = !projectedAccountsSortDesc}
		>
			{projectedAccountsSortDesc ? 'Low-High' : 'High-Low'}
		</button>
	</div>
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
				{#each paginatedProjectedAccounts as account}
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
						{formatCurrency(data.projected.total)}
					</td>
					<td class="text-[10px] text-gray-600 py-2 uppercase">
						{data.projected.byAccount.filter(a => !a.exclusionReason).length} of {data.projected.byAccount.length} accounts
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
	<PaginationClient page={projectionsPage} totalPages={totalProjectedPages} onPageChange={updateProjectionsPage} scrollTarget={projectionsSectionRef} />
	<div class="p-2 text-[10px] text-gray-600 border-t border-black uppercase font-mono">
		[TECHNICAL NOTE] Basis: balance * rate * (days / 365). fixed-term accounts project only to maturity date. non-matured fixed-term interest is excluded from taxable totals until maturity.
	</div>
</div>

<!-- SYSTEM INTEGRITY CHECK -->
<div class="border-b border-black">
	<div class="p-2 font-bold uppercase">System Integrity Check</div>
	<div class="p-2 font-mono text-[10px] space-y-1 uppercase">
		<div class="flex justify-between max-w-md">
			<span>Ledger reconciliation</span>
			<span class={data.reconciliation.actualVsTransactionsDelta === 0 ? 'text-green-700' : 'text-red-700 font-bold'}>
				{data.reconciliation.actualVsTransactionsDelta === 0 ? 'OK' : 'FAIL ' + formatCurrency(data.reconciliation.actualVsTransactionsDelta)}
			</span>
		</div>
		<div class="flex justify-between max-w-md">
			<span>Account cross-check</span>
			<span class={data.reconciliation.actualVsByAccountDelta === 0 ? 'text-green-700' : 'text-red-700 font-bold'}>
				{data.reconciliation.actualVsByAccountDelta === 0 ? 'OK' : 'FAIL ' + formatCurrency(data.reconciliation.actualVsByAccountDelta)}
			</span>
		</div>
		<div class="flex justify-between max-w-md">
			<span>Monthly sum validation</span>
			<span class={data.reconciliation.actualVsByMonthDelta === 0 ? 'text-green-700' : 'text-red-700 font-bold'}>
				{data.reconciliation.actualVsByMonthDelta === 0 ? 'OK' : 'FAIL ' + formatCurrency(data.reconciliation.actualVsByMonthDelta)}
			</span>
		</div>

		{#if data.reconciliation.flags.length > 0}
			<div class="text-red-700 mt-2 border-l-2 border-red-700 pl-2 py-1">
				[!] CRITICAL INTEGRITY ERRORS DETECTED
				<ul class="list-none pl-0 mt-1 space-y-1">
					{#each data.reconciliation.flags as flag}
						<li>- [{flag.type.toUpperCase()}] {flag.message}</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="text-green-700 mt-2 font-bold">
				NOMINAL OPERATING STATE - ALL RECONCILED ✓
			</div>
		{/if}
	</div>
</div>

<!-- TAX YEAR INTEREST RECORD SECTION -->
<div id="transactions-anchor" bind:this={transactionsSectionRef}>
	<div class="p-2 font-bold flex justify-between items-center uppercase border-b border-black">
		<div class="flex flex-col gap-1">
			<span>Tax Year Interest Record ({sortedTransactions.length} results)</span>
			{#if activeFilterLabel}
				<div class="flex items-center gap-2">
					<span class="text-[10px] bg-black text-white px-1 font-bold">FILTERED BY {activeFilterLabel.toUpperCase()}</span>
					<button type="button" class="bracket-link text-[10px] font-bold" onclick={clearFilters}>[Clear Filter]</button>
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="bracket-link text-xs"
			onclick={() => transactionsSortDesc = !transactionsSortDesc}
		>
			{transactionsSortDesc ? 'Oldest First' : 'Newest First'}
		</button>
	</div>
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
			<PaginationClient page={transactionsPage} totalPages={totalTransactionPages} onPageChange={updateTransactionsPage} scrollTarget={transactionsSectionRef} />
		</div>
	{/if}
	<div class="p-2 text-[10px] text-gray-600 border-t border-black uppercase font-mono">
		[TECHNICAL NOTE] Running total includes all interest posted since April 6th. Opening balance rows represent the starting state for each account in this tax year.
	</div>
</div>