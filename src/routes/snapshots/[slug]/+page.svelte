<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrencyShorthand } from '$lib/utils/currency';

	let { data, form } = $props();

	// Get accounts breakdown with null safety
	const accountsBreakdown = $derived(
		data.snapshot.accountsBreakdown || { accounts: [], totalByType: {}, snapshotTakenAt: '' }
	);

	// Get goals breakdown with null safety
	const goalsBreakdown = $derived(
		data.snapshot.goalsBreakdown || { goals: [], totalAllocated: 0 }
	);

	// Group accounts by type for display
	const accountsByType = $derived(() => {
		const groups: Record<string, typeof accountsBreakdown.accounts> = {};
		accountsBreakdown.accounts.forEach((account) => {
			if (!groups[account.type]) {
				groups[account.type] = [];
			}
			groups[account.type].push(account);
		});
		return groups;
	});

	// Capitalize account type for display
	function capitalizeType(type: string): string {
		return type
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">SNAPSHOT DETAIL</h1>
</div>

<!-- SNAPSHOT HEADER -->
<div class="border-b border-black p-2">
	<div class="flex justify-between items-center">
		<h2 class="text-base font-bold m-0 leading-none">{data.snapshot.snapshotDate}</h2>
		<form method="POST" action="/snapshots/{data.snapshot.slug}/delete" class="m-0">
			<button type="submit" class="bracket-link text-xs text-red-700">Archive</button>
		</form>
	</div>
</div>

<!-- FINANCIAL DATA (READ-ONLY) -->
<div class="border-b border-black">
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2 mb-2">
		<span>FINANCIAL DATA (READ-ONLY)</span>
		<span>Immutable record</span>
	</div>

  <div class="p-2 pt-0">
    <h3 class="font-bold mb-2 text-sm">FINANCIAL SUMMARY</h3>
    <div class="text-sm">
      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
        <span class="text-gray-600">Net Worth:</span>
        <span class="font-bold">{formatCurrencyShorthand(data.snapshot.netWorthInCents)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
        <span class="text-gray-600">Total Assets:</span>
        <span>{formatCurrencyShorthand(data.snapshot.totalAssetsInCents)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
        <span class="text-gray-600">Total Liabilities:</span>
        <span>{formatCurrencyShorthand(data.snapshot.totalLiabilitiesInCents)}</span>
      </div>
      <div class="flex justify-between py-1 last:border-0">
        <span class="text-gray-600">Total Allocated:</span>
        <span>{formatCurrencyShorthand(data.snapshot.totalAllocatedInCents)}</span>
      </div>
    </div>
  </div>
</div>

<!-- ACCOUNTS -->
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		ACCOUNTS ({accountsBreakdown.accounts.length})
	</div>
	<div class="p-2">
		{#each Object.entries(accountsByType()) as [type, accounts]}
			<div class="font-bold text-xs mb-1 mt-1 first:mt-0">{capitalizeType(type)} ({accounts.length})</div>
			{#each accounts as account}
				<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0">
					<span>{account.name}</span>
					<span class="{account.includedInTotal ? '' : 'text-gray-400'}">
						{formatCurrencyShorthand(account.balanceInCents)}
						{!account.includedInTotal ? ' (excluded)' : ''}
					</span>
				</div>
			{/each}
		{/each}
	</div>
</div>

<!-- GOALS -->
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		GOALS ({goalsBreakdown.goals.length})
	</div>
	<div class="p-2">
		{#each goalsBreakdown.goals as goal}
			<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span>{goal.name}</span>
				<span
					>{formatCurrencyShorthand(goal.currentAllocation)} /
					{formatCurrencyShorthand(goal.targetAmountInCents)}</span
				>
			</div>
		{/each}
	</div>
</div>

<!-- NOTES (EDITABLE) -->
<div class="">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		NOTES (EDITABLE)
	</div>
	<div class="p-2">
		{#if form?.error}
			<div class="mb-2 p-2 border border-red-700 bg-red-50 text-red-700 text-sm">
				{form.error}
			</div>
		{/if}

		<form method="POST" action="?/updateNotes" use:enhance>
			<label class="block font-bold mb-1 text-sm" for="notes">
				Edit Notes
			</label>
			<textarea
				id="notes"
				name="notes"
				rows="5"
				placeholder="Add context for this snapshot..."
				class="w-full border border-gray-300 p-2 text-sm font-mono"
			>{data.snapshot.notes || ''}</textarea>
			<p class="text-xs text-gray-600 mt-2 mb-2">
				Only the notes field can be edited. Financial data is immutable.
			</p>

			<div class="flex justify-end gap-4">
				<button type="submit" class="bracket-link text-sm">[Save Notes]</button>
			</div>
		</form>
	</div>
</div>
