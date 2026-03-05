<script lang="ts">
	import { page } from '$app/state';
	import { formatCurrency, formatAccountType as commonFormatAccountType, formatDateShorthand as commonFormatDateShorthand } from '$lib/utils/currency';
	import AccountFiltersModal from '$lib/components/AccountFiltersModal.svelte';
	import AccountSortModal from '$lib/components/AccountSortModal.svelte';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';

	let { data } = $props();

	// Modal state
	let filterModalOpen = $state(false);
	let sortModalOpen = $state(false);

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

	// Calculate summary stats
	const totalAccounts = $derived(data.accounts.length);
	const assetAccounts = $derived(
		data.accounts.filter((a) => a.category === 'asset' && (a.currentBalance ?? 0) >= 0).length
	);
	const liabilityAccounts = $derived(
		data.accounts.filter((a) => a.category === 'liability' || (a.category === 'asset' && (a.currentBalance ?? 0) < 0)).length
	);
	const maturingSoonAccounts = $derived(
		data.accounts.filter((a) => !a.closedAt && a.daysToMaturity !== null && a.daysToMaturity >= 0 && a.daysToMaturity <= 90)
	);

	// Calculate net worth — asset accounts with negative balance reclassify as liabilities
	const totalAssets = $derived.by(() => {
		let sum = 0;
		for (const a of data.accounts) {
			if (a.excludedFromNetWorth || a.closedAt) continue;
			const bal = a.currentBalance ?? 0;
			if (a.category === 'asset' && bal > 0) sum += bal;
		}
		return sum;
	});

	const totalLiabilities = $derived.by(() => {
		let sum = 0;
		for (const a of data.accounts) {
			if (a.excludedFromNetWorth || a.closedAt) continue;
			const bal = a.currentBalance ?? 0;
			if (a.category === 'liability') sum += bal;
			else if (a.category === 'asset' && bal < 0) sum += bal;
		}
		return sum;
	});

	const netWorth = $derived(totalAssets + totalLiabilities);
</script>

<!-- NET WORTH SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>NET WORTH</span>
	<span class="{netWorth >= 0 ? 'text-green-700' : 'text-red-700'} font-bold">{formatCurrency(netWorth)}</span>
</div>
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1">
		<span>Assets</span>
		<span class="text-green-700 font-bold">{formatCurrency(totalAssets)}</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Liabilities</span>
		<span class="text-red-700 font-bold">{formatCurrency(Math.abs(totalLiabilities))}</span>
	</div>
</div>

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
</div>

<!-- ACCOUNTS OVERVIEW SECTION -->
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
	</div>
</div>

<div class="p-0">
	{#if sortedAccounts.length === 0}
		<p class="text-gray-600 text-xs p-2">No accounts yet. Add your first account to start tracking.</p>
		<table>
			<thead>
				<tr>
					<th class="pl-2 text-left">Name</th>
					<th class="pl-2 text-left">Type</th>
					<th class="text-right pr-1">Balance</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td colspan="3" class="text-center text-gray-600 text-xs">No accounts found</td>
				</tr>
			</tbody>
		</table>
	{:else}
		<div class="overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr>
					<th class="pl-2 text-left whitespace-nowrap">Name</th>
					<th class="pl-2 text-left whitespace-nowrap">Type</th>
					<th class="pl-2 text-left whitespace-nowrap">Institution</th>
					<th class="text-right pr-1 whitespace-nowrap">Balance</th>
					<th class="text-right pr-1 whitespace-nowrap">Maturity</th>
					<th class="text-right pr-1 whitespace-nowrap">Last Updated</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedAccounts as account}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="pl-2 text-sm py-2 whitespace-nowrap">
							<a href="/accounts/{account.slug}" class="bracket-link" class:line-through={account.closedAt}>{truncateDisplay(account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</a>
							{#if account.closedAt}
								<span class="text-gray-600 text-xs"> (closed)</span>
							{/if}
						</td>
						<td class="pl-2 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>{formatAccountType(account.type)}</td>
						<td class="pl-2 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{truncateDisplay(account.institution || '-', DISPLAY_LIMITS.INSTITUTION_NAME)}
						</td>
						<td class="text-right pr-1 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{#if account.currentBalance !== null}
								<span class={account.currentBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
									{formatCurrency(account.currentBalance)}
								</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td class="text-right pr-1 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>
							{#if account.daysToMaturity === null}
								<span class="text-gray-600">-</span>
							{:else if account.daysToMaturity < 0}
								<span class="text-gray-500">Matured</span>
							{:else if account.daysToMaturity === 0}
								<span class="text-amber-700 font-bold">Today</span>
							{:else}
								<span class={account.daysToMaturity <= 90 ? 'text-amber-700 font-bold' : ''}>
									{account.daysToMaturity}d
								</span>
							{/if}
						</td>
						<td class="text-right pr-1 text-sm py-2 whitespace-nowrap" class:line-through={account.closedAt}>{formatDate(account.lastUpdated)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
	{/if}
</div>

{#if filterModalOpen}
	<AccountFiltersModal
		open={filterModalOpen}
		onClose={() => filterModalOpen = false}
		institutions={data.institutions}
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
