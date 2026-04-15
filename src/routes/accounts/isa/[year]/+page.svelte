<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { formatTaxWrapper, getMonthName, renderProgressBar } from '$lib/utils/formatting';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
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

	// Pagination state for transactions
	const txPagination = useUrlPagination('txPage');
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

	// Derived filtered transactions (deposits only for allowance tracking)
	const filteredTransactions = $derived.by(() => {
		return data.actual.transactions.filter(tx => {
			if (tx.type !== 'deposit') return false;

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
		const start = txPagination.page * TRANSACTIONS_PER_PAGE;
		const end = start + TRANSACTIONS_PER_PAGE;
		return sortedTransactions.slice(start, end);
	});

	const totalTransactionPages = $derived(Math.ceil(sortedTransactions.length / TRANSACTIONS_PER_PAGE));

	// Breakdown pagination state
	const breakdownsPagination = useUrlPagination('breakdownsPage');
	const BREAKDOWNS_PER_PAGE = 10;

	// Reset breakdown page when tab changes or sorts change
	$effect(() => {
		breakdownsPagination.page = 0;
	});

	// Reset page when filters change
	$effect(() => {
		txPagination.page = 0;

		// Scroll to transactions if a filter was applied
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

	const paginatedAccounts = $derived(sortedAccounts.slice(breakdownsPagination.page * BREAKDOWNS_PER_PAGE, (breakdownsPagination.page + 1) * BREAKDOWNS_PER_PAGE));
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

	const paginatedMonths = $derived(sortedMonths.slice(breakdownsPagination.page * BREAKDOWNS_PER_PAGE, (breakdownsPagination.page + 1) * BREAKDOWNS_PER_PAGE));
	const totalMonthPages = $derived(Math.ceil(sortedMonths.length / BREAKDOWNS_PER_PAGE));

	// Sort state for institution breakdown (default: amount descending)
	let institutionsSortDesc = $state(true);
	const sortedInstitutions = $derived.by(() => {
		const institutions = [...data.actual.byInstitution];
		institutions.sort((a, b) => institutionsSortDesc ? b.total - a.total : a.total - b.total);
		return institutions;
	});

	const paginatedInstitutions = $derived(sortedInstitutions.slice(breakdownsPagination.page * BREAKDOWNS_PER_PAGE, (breakdownsPagination.page + 1) * BREAKDOWNS_PER_PAGE));
	const totalInstitutionPages = $derived(Math.ceil(sortedInstitutions.length / BREAKDOWNS_PER_PAGE));

	// Sort state for wrapper breakdown (default: amount descending)
	let wrappersSortDesc = $state(true);
	const sortedWrappers = $derived.by(() => {
		const wrappers = [...data.actual.byTaxWrapper];
		wrappers.sort((a, b) => wrappersSortDesc ? b.total - a.total : a.total - b.total);
		return wrappers;
	});

	const paginatedWrappers = $derived(sortedWrappers.slice(breakdownsPagination.page * BREAKDOWNS_PER_PAGE, (breakdownsPagination.page + 1) * BREAKDOWNS_PER_PAGE));
	const totalWrapperPages = $derived(Math.ceil(sortedWrappers.length / BREAKDOWNS_PER_PAGE));

	// Tax year selector logic
	const currentYearSlug = $derived(data.meta.taxYearStart.getUTCFullYear() + '-' + String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2));

	const currentIndex = $derived(data.availableTaxYears.findIndex(ty => ty.slug === currentYearSlug));

	const prevYear = $derived(currentIndex < data.availableTaxYears.length - 1 ? data.availableTaxYears[currentIndex + 1] : null);
	const nextYear = $derived(currentIndex > 0 ? data.availableTaxYears[currentIndex - 1] : null);


	// Derived sort label based on active breakdown
	const sortLabel = $derived(() => {
		switch (activeBreakdown) {
			case 'account':
				return accountsSortDesc ? 'Low-High' : 'High-Low';
			case 'month':
				return monthsSortDesc ? 'Newest-Oldest' : 'Oldest-Newest';
			case 'institution':
				return institutionsSortDesc ? 'Low-High' : 'High-Low';
			case 'wrapper':
				return wrappersSortDesc ? 'Low-High' : 'High-Low';
			default:
				return 'Sort';
		}
	});
</script>

<!-- HEADER SECTION -->
<div class="border-b border-black p-2 flex justify-between items-start">
	<div>
		<h1 class="text-lg font-bold m-0 uppercase">ISA Subscription Breakdown</h1>
		<div class="text-sm text-gray-600 mt-1">
			Tax Year: {data.meta.taxYearStart.getUTCFullYear()}-{String(data.meta.taxYearEnd.getUTCFullYear()).slice(-2)}
		</div>
		<div class="text-xs text-gray-600">
			As of {formatDateShorthand(data.meta.asOfDate)} • {data.meta.daysRemainingInTaxYear} days remaining in tax year
		</div>
	</div>
	<div class="flex flex-col items-end gap-2">
		<div class="flex gap-2 mb-1">
			<a href="/accounts/isa/all" class="bracket-link text-xs">[All Years]</a>
		</div>
		<div class="text-[10px] uppercase font-bold text-gray-600">Tax Year</div>
		<div class="flex gap-1 items-center">
			{#if prevYear}
				<a href="/accounts/isa/{prevYear.slug}" class="bracket-link text-xs" data-sveltekit-noscroll>[Prev]</a>
			{/if}
			<span class="bracket-link bg-black text-white text-xs px-1">{currentYearSlug}</span>
			{#if nextYear}
				<a href="/accounts/isa/{nextYear.slug}" class="bracket-link text-xs" data-sveltekit-noscroll>[Next]</a>
			{/if}
		</div>
	</div>
</div>

<!-- KPI CARDS SECTION -->
<div class="border-b border-black">
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
		<!-- Total Subscribed -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Total Subscribed</div>
			<div class="text-lg font-bold text-green-700">{formatCurrency(data.meta.allowanceUsed)}</div>
			<div class="text-[10px] text-gray-600 mt-1">
				of {formatCurrency(data.meta.allowanceInCents)} allowance
			</div>
		</div>

		<!-- Allowance Remaining -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Allowance Remaining</div>
			<div class="text-lg font-bold {data.meta.allowanceRemaining > 0 ? 'text-green-700' : 'text-red-700'}">
				{formatCurrency(data.meta.allowanceRemaining)}
			</div>
			<div class="text-[10px] text-gray-600 mt-1">
				{data.meta.allowanceRemaining > 0 ? 'available to subscribe' : 'allowance exceeded'}
			</div>
		</div>

		<!-- Utilization -->
		<div class="border-r border-black p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Utilization</div>
			<div class="text-lg font-bold {data.meta.utilizationPercent >= 90 ? 'text-red-700' : data.meta.utilizationPercent >= 75 ? 'text-amber-700' : 'text-green-700'}">
				{data.meta.utilizationPercent}%
			</div>
			<div class="text-[10px] text-mono mt-1 text-gray-600">
				{renderProgressBar(data.meta.allowanceUsed, data.meta.allowanceInCents)}
			</div>
		</div>

		<!-- Warning Status -->
		<div class="p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Status</div>
			{#if data.meta.overAllowance}
				<div class="text-sm font-bold text-red-700">
					EXCEEDED
				</div>
			{:else if data.meta.utilizationPercent >= 90}
				<div class="text-sm font-bold text-amber-700">
					NEAR LIMIT
				</div>
			{:else if data.meta.utilizationPercent >= 75}
				<div class="text-sm font-bold text-yellow-700">
					ON TRACK
				</div>
			{:else}
				<div class="text-sm font-bold text-green-700">
					HEALTHY
				</div>
			{/if}
			<div class="text-[10px] text-gray-600 mt-1">
				{data.meta.daysRemainingInTaxYear} days left
			</div>
		</div>
	</div>
</div>

<!-- ISA PACING (current tax year only) -->
{#if data.pacing}
	{@const p = data.pacing}
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2 text-xs uppercase flex justify-between">
			<span>ISA Pacing — {p.taxYearLabel}</span>
			<span
				class="font-bold"
				class:text-green-700={p.status === 'full' || p.status === 'on-track'}
				class:text-amber-700={p.status === 'behind'}
				class:text-gray-400={p.status === 'no-data'}
			>
				{p.status === 'full' ? 'FULL' : p.status === 'on-track' ? 'ON TRACK' : p.status === 'behind' ? 'BEHIND' : 'NO DATA'}
			</span>
		</div>
		{#if p.status === 'no-data'}
			<div class="p-2 text-xs text-gray-500">No ISA deposits recorded this tax year yet.</div>
		{:else if p.status === 'full'}
			<div class="p-2 text-xs text-green-700 font-bold">ISA allowance fully used — well done!</div>
		{:else}
			<div class="grid grid-cols-2 md:grid-cols-4">
				<div class="border-r border-black p-2">
					<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Avg / Month</div>
					<div class="text-lg font-bold">{formatCurrency(p.actualMonthlyAvgInCents)}</div>
					<div class="text-[10px] text-gray-500">actual so far</div>
				</div>
				<div class="border-r border-black p-2">
					<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">{p.isLastMonth ? 'Required Total' : 'Required / Month'}</div>
					<div
						class="text-lg font-bold"
						class:text-amber-700={p.status === 'behind'}
						class:text-green-700={p.status === 'on-track'}
					>
						{formatCurrency(p.requiredMonthlyInCents)}
					</div>
					<div class="text-[10px] text-gray-500">to reach £20k</div>
				</div>
				<div class="border-r border-black p-2">
					<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Months Elapsed</div>
					<div class="text-lg font-bold">{p.monthsElapsed}</div>
					<div class="text-[10px] text-gray-500">
						{#if p.isLastMonth && p.daysRemainingInTaxYear > 0}
							{p.daysRemainingInTaxYear}d remaining
						{:else}
							{p.monthsRemaining} remaining
						{/if}
					</div>
				</div>
				<div class="p-2">
					<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Remaining</div>
					<div class="text-lg font-bold text-green-700">{formatCurrency(p.allowanceRemainingInCents)}</div>
					<div class="text-[10px] text-gray-500">{p.daysRemainingInTaxYear}d left</div>
				</div>
			</div>
			{#if p.status === 'behind'}
				<div class="border-t border-black p-2 text-xs text-amber-700">
					{#if p.isLastMonth}
						You need to deposit {formatCurrency(p.allowanceRemainingInCents)} in the next {p.daysRemainingInTaxYear} days to use the full allowance.
					{:else}
						You need to deposit an extra {formatCurrency(p.requiredMonthlyInCents - p.actualMonthlyAvgInCents)} / month above your current average to use the full allowance.
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}

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
			onclick={() => {
				if (activeBreakdown === 'account') accountsSortDesc = !accountsSortDesc;
				else if (activeBreakdown === 'month') monthsSortDesc = !monthsSortDesc;
				else if (activeBreakdown === 'institution') institutionsSortDesc = !institutionsSortDesc;
				else if (activeBreakdown === 'wrapper') wrappersSortDesc = !wrappersSortDesc;
			}}
		>
			{sortLabel()}
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalAccountPages} scrollTarget={breakdownsSectionRef} />
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type === 'deposit').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalMonthPages} scrollTarget={breakdownsSectionRef} />
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type === 'deposit').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalInstitutionPages} scrollTarget={breakdownsSectionRef} />
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
							<td class="text-right pr-3 text-sm tabular-nums font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-3 text-sm font-bold">{data.actual.transactions.filter(t => t.type === 'deposit').length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			<PaginationClient page={breakdownsPagination.page} onPageChange={breakdownsPagination.updatePage} totalPages={totalWrapperPages} scrollTarget={breakdownsSectionRef} />
		</div>
	{/if}
</div>

<!-- SYSTEM INTEGRITY CHECK -->
<div class="border-b border-black">
	<div class="p-2 font-bold uppercase">System Integrity Check</div>
	<div class="p-2 font-mono text-[10px] space-y-1 uppercase">
		<div class="flex justify-between max-w-md">
			<span>Account cross-check</span>
			<span class={data.reconciliation.totalVsByAccountDelta === 0 ? 'text-green-700' : 'text-red-700 font-bold'}>
				{data.reconciliation.totalVsByAccountDelta === 0 ? 'OK' : 'FAIL ' + formatCurrency(data.reconciliation.totalVsByAccountDelta)}
			</span>
		</div>
		<div class="flex justify-between max-w-md">
			<span>Monthly sum validation</span>
			<span class={data.reconciliation.totalVsByMonthDelta === 0 ? 'text-green-700' : 'text-red-700 font-bold'}>
				{data.reconciliation.totalVsByMonthDelta === 0 ? 'OK' : 'FAIL ' + formatCurrency(data.reconciliation.totalVsByMonthDelta)}
			</span>
		</div>
		<div class="flex justify-between max-w-md">
			<span>Transaction reconciliation</span>
			<span class={data.reconciliation.totalVsTransactionsDelta === 0 ? 'text-green-700' : 'text-red-700 font-bold'}>
				{data.reconciliation.totalVsTransactionsDelta === 0 ? 'OK' : 'FAIL ' + formatCurrency(data.reconciliation.totalVsTransactionsDelta)}
			</span>
		</div>

		{#if data.reconciliation.flags.length > 0}
			<div class="text-amber-700 mt-2 border-l-2 border-amber-700 pl-2 py-1">
				[!] FLAGS DETECTED
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

<!-- TAX YEAR ISA SUBSCRIPTION RECORD SECTION -->
<div id="transactions-anchor" bind:this={transactionsSectionRef}>
	<div class="p-2 font-bold flex justify-between items-center uppercase border-b border-black">
		<div class="flex flex-col gap-1">
			<span>Tax Year Subscription Record ({sortedTransactions.length} results)</span>
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
		<p class="text-gray-600 text-xs p-2 uppercase">No ISA subscriptions posted yet.</p>
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
		<div class="border-t border-black empty:hidden">
			<PaginationClient page={txPagination.page} totalPages={totalTransactionPages} onPageChange={txPagination.updatePage} scrollTarget={transactionsSectionRef} />
		</div>
	{/if}
	<div class="p-2 text-[10px] text-gray-600 border-t border-black uppercase font-mono">
		[TECHNICAL NOTE] Running total shows cumulative ISA subscription since April 6th. Only deposits count toward the £20,000 allowance. Transfers between ISAs are tracked but do not consume additional allowance.
	</div>
</div>