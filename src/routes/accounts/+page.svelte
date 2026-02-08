<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';

	let { data, form } = $props();

	// Sort state (client-side only)
	let sortBy = $state<'name' | 'type' | 'institution' | 'balance' | 'updated' | ''>('');

	// Quick-add balance form state
	let quickAddAccountId = $state('');
	let quickAddBalance = $state('');
	let quickAddNotes = $state('');

	// Helper function to format date
	function formatDate(date: Date | null): string {
		if (!date) return 'Never';
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Helper function to format account type for display
	function formatAccountType(type: string): string {
		const typeLabels: Record<string, string> = {
			current: 'Current',
			savings: 'Savings',
			credit: 'Credit Card',
			investment: 'Investment',
			ISA: 'ISA',
			LISA: 'LISA'
		};
		return typeLabels[type] || type;
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

	const sortedAccounts = $derived(sortAccounts(data.accounts));

	// Calculate summary stats
	const totalAccounts = $derived(data.accounts.length);
	const assetAccounts = $derived(
		data.accounts.filter((a) => a.type !== 'credit').length
	);
	const liabilityAccounts = $derived(
		data.accounts.filter((a) => a.type === 'credit').length
	);

	// Calculate net worth
	const totalAssets = $derived(
		data.accounts
			.filter((a) => a.type !== 'credit' && !a.excludedFromNetWorth && !a.closedAt)
			.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0)
	);

	const totalLiabilities = $derived(
		data.accounts
			.filter((a) => a.type === 'credit' && !a.excludedFromNetWorth && !a.closedAt)
			.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0)
	);

	const netWorth = $derived(totalAssets - totalLiabilities);
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">ACCOUNTS</h1>
</div>

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
		<span class="text-red-700 font-bold">{formatCurrency(totalLiabilities)}</span>
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

<!-- ACCOUNTS OVERVIEW SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>ACCOUNTS OVERVIEW</span>
	<a href="/accounts/create" class="bracket-link text-xs">Create Account</a>
</div>

<div class="border-b border-black p-2">
	{#if sortedAccounts.length === 0}
		<p class="text-gray-600 text-xs mb-2">No accounts yet. Add your first account to start tracking.</p>
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>Type</th>
					<th class="text-right">Balance</th>
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
					<th>Name</th>
					<th>Type</th>
					<th>Institution</th>
					<th class="text-right">Balance</th>
					<th>Last Updated</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedAccounts as account}
					<tr class:line-through={account.closedAt}>
						<td>
							<a href="/accounts/{account.slug}" class="bracket-link">{account.name}</a>
							{#if account.closedAt}
								<span class="text-gray-600 text-xs"> (closed)</span>
							{/if}
						</td>
						<td>{formatAccountType(account.type)}</td>
						<td>{account.institution || '-'}</td>
						<td class="text-right">
							{#if account.currentBalance !== null}
								<span class={account.type === 'credit' ? 'text-red-700' : 'text-green-700'}>
									{formatCurrency(account.currentBalance)}
								</span>
							{:else}
								<span class="text-gray-600">-</span>
							{/if}
						</td>
						<td>{formatDate(account.lastUpdated)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<!-- QUICK ADD BALANCE SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>QUICK ADD BALANCE</span>
</div>

<div class="border-b border-black p-2">
	{#if sortedAccounts.length === 0}
		<p class="text-gray-600 text-xs">Create an account first to add a balance.</p>
	{:else}
		<form method="POST" use:enhance>
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
					{#each sortedAccounts.filter(a => !a.closedAt) as account}
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
