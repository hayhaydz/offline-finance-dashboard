<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { formatCurrency, formatAccountType as commonFormatAccountType, formatDate as commonFormatDate } from '$lib/utils/currency';
	import { invalidateAll } from '$app/navigation';
	import AccountFiltersModal from '$lib/components/AccountFiltersModal.svelte';

	let { data, form } = $props();

	// Modal state
	let filterModalOpen = $state(false);

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

	// Quick-add balance form state
	let quickAddOpen = $state(false);
	let quickAddAccountId = $state('');
	let quickAddBalance = $state('');
	let quickAddNotes = $state('');
	let quickAddMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Clear success messages after 10 seconds, errors persist until manually dismissed
	$effect(() => {
		if (quickAddMessage) {
			const timeout = setTimeout(() => {
				if (quickAddMessage?.type === 'success') {
					quickAddMessage = null;
				}
			}, 10000);
			return () => clearTimeout(timeout);
		}
	});

	// Helper function to format date
	function formatDate(date: Date | null): string {
		return commonFormatDate(date);
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
		data.accounts.filter((a) => a.category === 'asset').length
	);
	const liabilityAccounts = $derived(
		data.accounts.filter((a) => a.category === 'liability').length
	);

	// Calculate net worth (liabilities stored as negative, so add them)
	const totalAssets = $derived(
		data.accounts
			.filter((a) => a.category === 'asset' && !a.excludedFromNetWorth && !a.closedAt)
			.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0)
	);

	const totalLiabilities = $derived(
		data.accounts
			.filter((a) => a.category === 'liability' && !a.excludedFromNetWorth && !a.closedAt)
			.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0)
	);

	const netWorth = $derived(totalAssets + totalLiabilities);
</script>

<!-- NET WORTH SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>NET WORTH</span>
	<span class="text-green-700 font-bold">{formatCurrency(netWorth)}</span>
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
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>SUMMARY</span>
</div>
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
</div>

<!-- QUICK BALANCE ENTRY SECTION -->
<button 
	type="button"
	class="w-full font-bold flex justify-between bg-gray-100 border-b border-black p-2 hover:bg-gray-200 transition-colors cursor-pointer"
	onclick={() => quickAddOpen = !quickAddOpen}
>
	<span>QUICK BALANCE ENTRY</span>
	<span>{quickAddOpen ? '[-]' : '[+]'}</span>
</button>

<div class="grid transition-[grid-template-rows] duration-300 ease-in-out border-b border-black overflow-hidden" style="grid-template-rows: {quickAddOpen ? '1fr' : '0fr'};">
	<div class="min-h-0">
		<div class="p-2">
			{#if data.accounts.length === 0}
				<p class="text-gray-600 text-xs">Create an account first to add a balance.</p>
			{:else}
				{#if form?.success}
					<div class="mb-2 p-2 border border-black text-sm bg-green-100">
						{form.success}
					</div>
				{/if}
				{#if quickAddMessage}
					<div class="mb-2 p-2 border border-black text-sm flex justify-between items-start {quickAddMessage.type === 'error' ? 'bg-red-100' : 'bg-green-100'}">
						<div class="flex-1">
							{@html quickAddMessage.text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">[$1]</a>')}
						</div>
						<button
							type="button"
							onclick={() => quickAddMessage = null}
							class="ml-2 text-xs bracket-link"
						>
							[Dismiss]
						</button>
					</div>
				{/if}
				<form method="POST" action="?/quickAdd" use:enhance={() => {
					return async ({ formElement, result }) => {
						if (result.type === 'success') {
							// Show success message
							quickAddMessage = { type: 'success', text: (result.data as { success?: string }).success || 'Balance entry added' };
							// Clear form fields
							quickAddBalance = '';
							quickAddNotes = '';
							formElement.reset();
						} else if (result.type === 'failure' && result.data) {
							// Show error message
							const errorData = result.data as { error?: string };
							if (errorData.error) {
								quickAddMessage = { type: 'error', text: errorData.error };
							}
						}
						// Invalidate all page data to refresh accounts and balances
						await invalidateAll();
					};
				}}>
					<input type="hidden" name="accountId" bind:value={quickAddAccountId} />

					<div class="mb-1">
						<label for="account" class="font-bold text-xs block mb-1">Account</label>
						<select
							id="account"
							name="account"
							bind:value={quickAddAccountId}
							class="border border-black p-1 w-full font-terminal text-sm focus:outline-none"
							required
						>
							<option value="">Select account...</option>
							{#each data.accounts.filter(a => !a.closedAt) as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
					</div>

					<div class="mb-1">
						<label for="balance" class="font-bold text-xs block mb-1">Balance (today)</label>
						<input
							type="text"
							id="balance"
							name="balance"
							bind:value={quickAddBalance}
							placeholder="e.g., 1000.00"
							inputmode="numeric"
							class="border border-black p-1 w-full font-terminal text-sm focus:outline-none"
							required
						/>
					</div>

					<div class="mb-1">
						<label for="notes" class="font-bold text-xs block mb-1">Notes (optional)</label>
						<textarea
							id="notes"
							name="notes"
							bind:value={quickAddNotes}
							placeholder="Optional notes..."
							rows="2"
							class="border border-black p-1 w-full font-terminal text-sm focus:outline-none"
						></textarea>
					</div>

					{#if form?.error}
						<div class="bg-amber-100 border border-black p-2 mb-2 text-sm">
							{@html form.error.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">[$1]</a>')}
						</div>
					{/if}

					<button
						type="submit"
						class="bracket-link text-sm"
					>
						Add Balance
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>

<!-- ACCOUNTS OVERVIEW SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<div class="flex items-center gap-2">
		<span>ACCOUNTS OVERVIEW</span>
		{#if hasActiveFilters}
			<span class="bg-black text-white px-1 text-[10px] uppercase">
				Filtered ({activeFilterCount})
			</span>
			<a href="/accounts" class="bracket-link text-[10px]">[Clear All]</a>
		{/if}
	</div>
	<div class="flex gap-2">
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

<div class="p-2">
	{#if sortedAccounts.length === 0}
		<p class="text-gray-600 text-xs mb-2">No accounts yet. Add your first account to start tracking.</p>
		<table>
			<thead>
				<tr>
					<th class="text-left pl-1">Name</th>
					<th class="text-left pl-1">Type</th>
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
		<!-- Sort dropdown -->
		<div class="mb-2">
			<label for="sort" class="font-bold text-xs mr-2">Sort by:</label>
			<select
				id="sort"
				bind:value={sortBy}
				class="border border-black p-1 font-terminal text-sm focus:outline-none"
			>
				<option value="">Default (newest first)</option>
				<option value="name">Name</option>
				<option value="type">Type</option>
				<option value="institution">Institution</option>
				<option value="balance">Balance</option>
				<option value="updated">Last Updated</option>
			</select>
		</div>

		<table>
			<thead>
				<tr>
					<th class="text-left pl-1">Name</th>
					<th class="text-left pl-1">Type</th>
					<th class="text-left pl-1">Institution</th>
					<th class="text-right pl-1 pr-4">Balance</th>
					<th class="text-right pr-1">Last Updated</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedAccounts as account}
					<tr>
						<td class="pl-1">
							<a href="/accounts/{account.slug}" class="bracket-link" class:line-through={account.closedAt}>{account.name}</a>
							{#if account.closedAt}
								<span class="text-gray-600 text-xs"> (closed)</span>
							{/if}
						</td>
						<td class="pl-1" class:line-through={account.closedAt}>{formatAccountType(account.type)}</td>
						<td class="pl-1" class:line-through={account.closedAt}>{account.institution || '-'}</td>
						<td class="text-right pl-1 pr-4" class:line-through={account.closedAt}>
							{#if account.currentBalance !== null}
								<span class={account.category === 'liability' ? 'text-red-700' : 'text-green-700'}>
									{formatCurrency(account.currentBalance)}
								</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td class="text-right pr-1" class:line-through={account.closedAt}>{formatDate(account.lastUpdated)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

{#if filterModalOpen}
	<AccountFiltersModal 
		open={filterModalOpen} 
		onClose={() => filterModalOpen = false} 
		institutions={data.institutions} 
	/>
{/if}
