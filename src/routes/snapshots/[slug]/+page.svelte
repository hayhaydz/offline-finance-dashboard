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

	function handleCancel() {
		window.location.href = '/snapshots';
	}
</script>

<div class="max-w-[1200px] mx-auto p-8">
	<header class="flex justify-between items-center border-b border-gray-300 pb-4 mb-8">
		<div>
			<h1 class="m-0">Snapshot Details</h1>
			<p class="mt-2 mb-0">{data.snapshot.snapshotDate}</p>
		</div>
		<a href="/snapshots" class="bracket-link">[Back to Snapshots]</a>
	</header>

	<main>
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>FINANCIAL DATA (READ-ONLY)</span>
				<span>Immutable record</span>
			</div>

			<div class="bg-gray-50 border border-black p-4">
				<h3 class="font-bold mb-3 text-sm">FINANCIAL SUMMARY</h3>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-gray-600">Net Worth:</span>
						<span class="ml-2 font-bold">{formatCurrencyShorthand(data.snapshot.netWorthInCents)}</span>
					</div>
					<div>
						<span class="text-gray-600">Total Assets:</span>
						<span class="ml-2">{formatCurrencyShorthand(data.snapshot.totalAssetsInCents)}</span>
					</div>
					<div>
						<span class="text-gray-600">Total Liabilities:</span>
						<span class="ml-2">{formatCurrencyShorthand(data.snapshot.totalLiabilitiesInCents)}</span>
					</div>
					<div>
						<span class="text-gray-600">Total Allocated:</span>
						<span class="ml-2">{formatCurrencyShorthand(data.snapshot.totalAllocatedInCents)}</span>
					</div>
				</div>
			</div>
		</section>

		<section class="mb-8">
			<div class="font-bold bg-gray-100 border-b border-black p-2">
				ACCOUNTS ({accountsBreakdown.accounts.length})
			</div>
			<div class="bg-gray-50 border border-black p-4">
				{#each Object.entries(accountsByType()) as [type, accounts]}
					<div class="mb-3">
						<div class="font-bold text-xs mb-1">{type} ({accounts.length})</div>
						{#each accounts as account}
							<div class="text-xs flex justify-between py-1">
								<span>{account.name}</span>
								<span class="{account.includedInTotal ? '' : 'text-gray-400'}">
									{formatCurrencyShorthand(account.balanceInCents)}
									{!account.includedInTotal ? ' (excluded)' : ''}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>

		<section class="mb-8">
			<div class="font-bold bg-gray-100 border-b border-black p-2">
				GOALS ({goalsBreakdown.goals.length})
			</div>
			<div class="bg-gray-50 border border-black p-4">
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
		</section>

		<section class="mb-8">
			<div class="font-bold bg-gray-100 border-b border-black p-2">
				NOTES (EDITABLE)
			</div>

			{#if form?.error}
				<div class="p-3 bg-red-50 border border-red-700 text-red-700 text-sm">
					{form.error}
				</div>
			{/if}

			<form method="POST" action="?/updateNotes" use:enhance>
				<div class="bg-gray-50 border border-black p-4">
					<label class="block font-bold mb-2" for="notes">
						Edit Notes
					</label>
					<textarea
						id="notes"
						name="notes"
						rows="5"
						placeholder="Add context for this snapshot..."
						class="w-full border border-gray-300 p-2 text-sm"
					>{data.snapshot.notes || ''}</textarea>
					<p class="text-xs text-gray-600 mt-2 mb-0">
						Only the notes field can be edited. Financial data is immutable.
					</p>
				</div>

				<div class="flex justify-end gap-4 mt-4">
					<button type="button" onclick={handleCancel} class="bracket-link">[Cancel]</button>
					<button type="submit" class="bracket-link">[Save Notes]</button>
				</div>
			</form>
		</section>

		<section>
			<form method="POST" action="/snapshots/{data.snapshot.slug}/delete">
				<button type="submit" class="bracket-link text-red-700">[Delete Snapshot]</button>
			</form>
		</section>
	</main>
</div>
