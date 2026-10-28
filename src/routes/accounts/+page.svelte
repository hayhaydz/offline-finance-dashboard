<script lang="ts">
	import AlertsSection from '$lib/components/AlertsSection.svelte';
	import { listnav } from '$lib/utils/list-nav';
	import { page } from '$app/state';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import { formatCurrency, formatAccountType as commonFormatAccountType, formatDateShorthand as commonFormatDateShorthand } from '$lib/utils/currency';
	import IsaAllowanceWidget from '$lib/components/IsaAllowanceWidget.svelte';
	import AccountFiltersModal from '$lib/components/AccountFiltersModal.svelte';
	import AccountSortModal from '$lib/components/AccountSortModal.svelte';
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import { groupAccountsByType } from '$lib/utils/account-grouping';

	let { data } = $props();

	// Modal state
	let filterModalOpen = $state(false);
	let sortModalOpen = $state(false);

	// Closed-account toggle state per type section (localStorage persistence)
	const CLOSED_TOGGLE_KEY = 'accounts:show-closed:';
	let closedExpanded = $state<Record<string, boolean>>({});

	// #12: flat view = one ungrouped list under the global sort (persisted)
	let flatView = $state(false);
	$effect(() => {
		flatView = localStorage.getItem('accounts:view') === 'flat';
	});

	$effect(() => {
		// Client-only hydration of persisted toggle state ($effect skips SSR)
		for (const section of groupedSections) {
			if (!(section.type in closedExpanded)) {
				closedExpanded[section.type] =
					localStorage.getItem(CLOSED_TOGGLE_KEY + section.type) === '1';
			}
		}
	});

	function showClosed(type: string): boolean {
		// Explicit closed-status filter forces expansion (the filtered rows
		// ARE the result — hiding them behind the toggle would defeat it)
		return activeFilters.status === 'closed' || (closedExpanded[type] ?? false);
	}

	function toggleClosed(type: string): void {
		closedExpanded[type] = !showClosed(type);
		localStorage.setItem(
			CLOSED_TOGGLE_KEY + type,
			closedExpanded[type] ? '1' : '0'
		);
	}

	// Pagination state
	let accountsSectionRef: HTMLElement | null = $state(null);
	const pagination = useUrlPagination('page');

	// Sync from server data (initial + navigation)
	$effect(() => {
		pagination.page = data.accountsPagination.page;
	});

	// Current tax year slug for interest links

	// Current filters from URL
	const activeFilters = $derived({
		type: page.url.searchParams.get('type')?.split(',').filter(Boolean) || [],
		category: page.url.searchParams.get('category') || '',
		taxWrapper: page.url.searchParams.get('taxWrapper')?.split(',').filter(Boolean) || [],
		liquidity: page.url.searchParams.get('liquidity')?.split(',').filter(Boolean) || [],
		status: page.url.searchParams.get('status') || '',
		exclusion: page.url.searchParams.get('exclusion') || '',
		institution: page.url.searchParams.get('institution')?.split(',').filter(Boolean) || [],
		stale: page.url.searchParams.get('stale') || ''
	});

	const activeFilterCount = $derived(
		(activeFilters.type.length > 0 ? 1 : 0) +
		(activeFilters.taxWrapper.length > 0 ? 1 : 0) +
		(activeFilters.liquidity.length > 0 ? 1 : 0) +
		(activeFilters.institution.length > 0 ? 1 : 0) +
		(activeFilters.category !== '' ? 1 : 0) +
		(activeFilters.status !== '' ? 1 : 0) +
		(activeFilters.exclusion !== '' ? 1 : 0) +
		(activeFilters.stale !== '' ? 1 : 0)
	);

	const hasActiveFilters = $derived(activeFilterCount > 0);

	// Sort state (client-side only)
	let sortBy = $state<'name' | 'type' | 'institution' | 'balance' | 'updated' | ''>('');

	// Helper function to format date
	function formatDate(date: Date | null): string {
		return commonFormatDateShorthand(date);
	}

	// Helper function to format maturity display
	function formatMaturity(daysToMaturity: number | null, maturityDate: Date | null): string {
		if (daysToMaturity === null) return '-';
		if (daysToMaturity < 0) return 'Matured';
		if (daysToMaturity === 0) return 'Today';
		if (daysToMaturity > 30) return formatDate(maturityDate);
		return `${daysToMaturity}d`;
	}

	// Helper function to format account type for display
	function formatAccountType(type: string): string {
		return commonFormatAccountType(type);
	}

	// Sort accounts
	function sortAccounts(accounts: typeof data.accounts) {
		if (!sortBy) return accounts;

		return [...accounts].sort((a, b) => {
			switch (sortBy) {
				case 'name':
					return a.name.localeCompare(b.name);
				case 'type':
					return a.type.localeCompare(b.type);
				case 'institution':
					return (a.institution || '').localeCompare(b.institution || '');
				case 'balance':
					const aBalance = a.currentBalance ?? 0;
					const bBalance = b.currentBalance ?? 0;
					return aBalance - bBalance;
				case 'updated':
					const aDate = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
					const bDate = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
					return bDate - aDate; // Most recent first
				default:
					return 0;
			}
		});
	}

	const filteredAccounts = $derived.by(() => {
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

		return data.accounts.filter(a => {
			if (activeFilters.type.length > 0 && !activeFilters.type.includes(a.type)) return false;
			if (activeFilters.category && a.category !== activeFilters.category) return false;
			if (activeFilters.taxWrapper.length > 0 && !activeFilters.taxWrapper.includes(a.taxWrapper)) return false;
			if (activeFilters.liquidity.length > 0 && !activeFilters.liquidity.includes(a.liquidity || '')) return false;
			if (activeFilters.institution.length > 0 && !activeFilters.institution.includes(a.institution || '')) return false;

			if (activeFilters.status === 'open' && a.closedAt) return false;
			if (activeFilters.status === 'closed' && !a.closedAt) return false;

			if (activeFilters.exclusion === 'included' && a.excludedFromNetWorth) return false;
			if (activeFilters.exclusion === 'excluded' && !a.excludedFromNetWorth) return false;

			if (activeFilters.stale === 'yes') {
				const lastUpdate = a.lastUpdated ? new Date(a.lastUpdated) : null;
				if (!lastUpdate || lastUpdate < thirtyDaysAgo) {
					// Is stale
				} else {
					return false;
				}
			}
			if (activeFilters.stale === 'no') {
				const lastUpdate = a.lastUpdated ? new Date(a.lastUpdated) : null;
				if (lastUpdate && lastUpdate >= thirtyDaysAgo) {
					// Is up to date
				} else {
					return false;
				}
			}

			return true;
		});
	});

	const sortedAccounts = $derived(sortAccounts(filteredAccounts));

	// #17: staleness dot — open accounts with no transaction activity in
	// 35+ days (or ever). Matches the filter modal's stale concept, but at
	// the roadmap's 35-day threshold; amber square, tooltip explains.
	const STALE_DAYS = 35;
	function isStaleAccount(account: (typeof data.accounts)[number]): boolean {
		if (account.closedAt) return false;
		if (!account.lastUpdated) return true;
		const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
		return new Date(account.lastUpdated).getTime() < cutoff;
	}

	// Placement: per type section, open accounts first, closed behind the
	// collapsed [Show N closed] toggle (closed accounts still count in
	// interest/ISA/tax-year history — placement only changes listing order)
	const groupedSections = $derived(groupAccountsByType(sortedAccounts));

	// Calculate summary stats — P1-7 policy (2026-10-27 audit): OPEN
	// accounts only, consistent with Home's ACCOUNTS (N) and the
	// Liabilities page count; closed accounts get their own context row.
	const openAccounts = $derived(data.accounts.filter((a) => !a.closedAt));
	const closedAccountCount = $derived(data.accounts.length - openAccounts.length);
	const totalAccounts = $derived(openAccounts.length);
	const assetAccounts = $derived(
		openAccounts.filter((a) => a.category === 'asset' && (a.currentBalance ?? 0) >= 0).length
	);
	const liabilityAccounts = $derived(
		openAccounts.filter((a) => a.category === 'liability' || (a.category === 'asset' && (a.currentBalance ?? 0) < 0)).length
	);
	const maturingSoonAccounts = $derived(
		data.accounts.filter((a) => !a.closedAt && a.daysToMaturity !== null && a.daysToMaturity >= 0 && a.daysToMaturity <= 90)
	);
</script>

<!-- Close/delete feedback banners (audit #10) -->
{#if page.url.searchParams.get('closed') === '1'}
	<div class="border-b border-black bg-green-50 p-2 text-sm text-green-900">
		Account closed — history preserved. Closed accounts sit behind the [Show N closed] toggle per type section.
	</div>
{/if}
{#if page.url.searchParams.get('deleted') === '1'}
	<div class="border-b border-black bg-gray-100 p-2 text-sm">
		Account deleted.
	</div>
{/if}

<!-- NET WORTH SECTION -->
<NetWorthDisplay
	summary={data.netWorthSummary}
	accounts={data.accounts}
/>

<!-- SUMMARY SECTION -->
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1">
		<span>Total Accounts</span>
		<span>{totalAccounts}</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Asset Accounts</span>
		<span>{assetAccounts}</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Liability Accounts</span>
		<span>{liabilityAccounts}</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Maturing Soon (90d)</span>
		<span class={maturingSoonAccounts.length > 0 ? 'text-amber-700 font-bold' : ''}>{maturingSoonAccounts.length}</span>
	</div>
	{#if closedAccountCount > 0}
		<div class="flex justify-between my-1 text-gray-500">
			<span>Closed Accounts (not counted above)</span>
			<span>{closedAccountCount}</span>
		</div>
	{/if}
</div>

{#if sortedAccounts.length > 0}
  <AlertsSection alerts={data.alerts} title="ACCOUNT ALERTS" viewAllHref="/alerts" />
{/if}

<!-- ACCOUNTS OVERVIEW SECTION -->
<!-- Wrapper div for scroll-to-top reference -->
<div bind:this={accountsSectionRef}>
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
		<div class="flex items-center gap-2">
			{#if hasActiveFilters}
				<span class="bg-black text-white px-1 text-xs uppercase">
					Filtered ({activeFilterCount})
				</span>
				<a href="/accounts" class="bracket-link text-xs">Clear All</a>
			{/if}
		</div>
		<div class="flex gap-2">
			<!-- #12: flat (ungrouped) view toggle -->
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => { flatView = !flatView; localStorage.setItem('accounts:view', flatView ? 'flat' : 'grouped'); }}
			>
				{flatView ? '[Group By Type]' : '[Flat View]'}
			</button>
			<!-- #16: bulk balance update screen -->
			<a href="/accounts/balances" class="bracket-link text-xs">[Update Balances]</a>
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => sortModalOpen = true}
			>
				Sort
			</button>
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => filterModalOpen = true}
			>
				Filters
			</button>
			<a href="/accounts/create" class="bracket-link text-xs">Create Account</a>
			<a href="/api/transactions/export" class="bracket-link text-xs">Export CSV</a>
		</div>
	</div>

	<div class="p-0">
	{#if sortedAccounts.length === 0}
		<p class="text-gray-600 text-xs p-2">No accounts yet. Add your first account to start tracking.</p>
		<table>
			<thead>
				<tr>
					<th class="pl-3 text-left">Name</th>
					<th class="pl-3 text-left">Type</th>
					<th class="pl-3 text-left">Institution</th>
					<th class="text-right pr-3">Balance</th>
					<th class="text-right pr-3">Rate</th>
					<th class="text-right pr-3">Monthly</th>
					<th class="text-right pr-3">Yearly</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td colspan="7" class="text-center text-gray-600 text-xs">No accounts found</td>
				</tr>
			</tbody>
		</table>
	{:else}
		<div class="overflow-x-auto">
		<table class="min-w-[900px] w-full">
			<thead>
				<tr>
					<!-- #12: sticky header keeps column labels visible on long lists -->
					<th class="pl-3 text-left whitespace-nowrap min-w-[140px] sticky top-0 bg-white border-b border-black z-10">Name</th>
					<th class="pl-3 text-left whitespace-nowrap min-w-[100px] sticky top-0 bg-white border-b border-black z-10">Type</th>
					<th class="pl-3 text-left whitespace-nowrap min-w-[120px] sticky top-0 bg-white border-b border-black z-10">Institution</th>
					<th class="text-right pr-3 whitespace-nowrap min-w-[110px] sticky top-0 bg-white border-b border-black z-10">Balance</th>
					<th class="text-right pr-3 whitespace-nowrap min-w-[70px] sticky top-0 bg-white border-b border-black z-10">Rate</th>
					<th class="text-right pr-3 whitespace-nowrap min-w-[90px] sticky top-0 bg-white border-b border-black z-10">Monthly</th>
					<th class="text-right pr-3 whitespace-nowrap min-w-[90px] sticky top-0 bg-white border-b border-black z-10">Yearly</th>
					<th class="text-right pr-3 whitespace-nowrap min-w-[80px] sticky top-0 bg-white border-b border-black z-10">Maturity</th>
					<th class="text-right pr-3 whitespace-nowrap min-w-[90px] sticky top-0 bg-white border-b border-black z-10">Last Updated</th>
				</tr>
			</thead>
			<tbody use:listnav>
				{#snippet accountRow(account: (typeof data.accounts)[number])}
					<tr class="border-b border-gray-200 last:border-b-0" data-nav-row>
						<td class="pl-3 text-sm py-2 whitespace-nowrap">
							<a href="/accounts/{account.slug}" class="bracket-link" class:line-through={account.closedAt}>{truncateDisplay(account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</a>
							{#if account.closedAt}
								<span class="text-gray-600 text-xs"> (closed)</span>
							{/if}
						</td>
						<td class="pl-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>{formatAccountType(account.type)}</td>
						<td class="pl-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{truncateDisplay(account.institution || '-', DISPLAY_LIMITS.INSTITUTION_NAME)}
						</td>
						<td class="text-right pr-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{#if account.currentBalance !== null}
								<span class={account.currentBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
									{formatCurrency(account.currentBalance)}
								</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td class="text-right pr-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{#if account.currentRate !== null && (account.currentBalance ?? 0) !== 0}
								<span class="tabular-nums">{(account.currentRate / 100).toFixed(2)}%</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td class="text-right pr-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{#if account.monthlyInterest !== 0}
								<span class="tabular-nums" class:text-green-700={account.monthlyInterest > 0} class:text-red-700={account.monthlyInterest < 0}>
									{formatCurrency(account.monthlyInterest)}
								</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td class="text-right pr-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{#if account.yearlyInterest !== 0}
								<span class="tabular-nums" class:text-green-700={account.yearlyInterest > 0} class:text-red-700={account.yearlyInterest < 0}>
									{formatCurrency(account.yearlyInterest)}
								</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td class="text-right pr-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							<span class={account.daysToMaturity !== null && account.daysToMaturity >= 0 && account.daysToMaturity <= 90 ? 'text-amber-700 font-bold' : ''}>
								{formatMaturity(account.daysToMaturity, account.maturityDate)}
							</span>
						</td>
						<td class="text-right pr-3 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>{formatDate(account.lastUpdated)}{#if isStaleAccount(account)}<span class="inline-block w-2 h-2 bg-amber-500 align-middle ml-1" title="stale: no activity for 35+ days"></span>{/if}</td>
					</tr>
				{/snippet}
				{#if flatView}
					<!-- #12: flat view — one list, global sort, no type headers -->
					{#each sortedAccounts as account (account.id)}
						{@render accountRow(account)}
					{/each}
				{:else}
				{#each groupedSections as section (section.type)}
					<tr class="border-b border-black">
						<td colspan="9" class="pl-3 py-1 bg-gray-100 font-bold text-xs uppercase">
							{formatAccountType(section.type)}
							<span class="font-normal text-gray-600"> ({section.open.length + section.closed.length})</span>
						</td>
					</tr>
					{#each section.open as account (account.id)}
						{@render accountRow(account)}
					{/each}
					{#if section.closed.length > 0}
						<tr class="border-b border-gray-200">
							<td colspan="9" class="pl-3 py-1 bg-gray-50">
								<button
									type="button"
									class="bracket-link text-xs"
									onclick={() => toggleClosed(section.type)}
								>
									{showClosed(section.type)
										? `[Hide ${section.closed.length} closed]`
										: `[Show ${section.closed.length} closed]`}
								</button>
							</td>
						</tr>
						{#if showClosed(section.type)}
							{#each section.closed as account (account.id)}
								{@render accountRow(account)}
							{/each}
						{/if}
					{/if}
				{/each}
				{/if}
			</tbody>
		</table>
		</div>
		<PaginationClient
			page={pagination.page}
			totalPages={data.accountsPagination.totalPages}
			onPageChange={pagination.updatePage}
			scrollTarget={accountsSectionRef}
		/>
	{/if}
	</div>
</div>
<!-- End of accounts section wrapper for scroll-to-top -->

{#if filterModalOpen}
	<AccountFiltersModal
		open={filterModalOpen}
		onClose={() => filterModalOpen = false}
		institutions={data.institutions}
		institutionCounts={data.institutionCounts}
	/>
{/if}

{#if sortModalOpen}
	<AccountSortModal
		open={sortModalOpen}
		onClose={() => sortModalOpen = false}
		onApply={(value) => sortBy = value}
		currentSort={sortBy}
	/>
{/if}