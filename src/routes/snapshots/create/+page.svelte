<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import type { SnapshotPreviewData } from '$lib/utils/snapshots';
	import { formatCurrencyShorthand } from '$lib/utils/currency';

	let { data, form }: { data: { preview: SnapshotPreviewData; defaultDate: string }; form: ActionData } =
		$props();

	// Group accounts by type for preview
	const accountsByType = $derived(() => {
		const groups: Record<string, typeof data.preview.accountsBreakdown.accounts> = {};
		data.preview.accountsBreakdown.accounts.forEach((account) => {
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
	<h1 class="text-lg font-bold mb-0 mt-0">CREATE SNAPSHOT</h1>
</div>

<!-- HEADER WITH ACTIONS -->
<div class="border-b border-black p-2">
	<div class="flex justify-between items-center">
		<h2 class="text-base font-bold m-0 leading-none">New Snapshot</h2>
		<div class="flex gap-2">
			<button type="submit" form="snapshot-form" class="bracket-link text-xs">Create Snapshot</button>
			<a href="/snapshots" class="bracket-link text-xs">Cancel</a>
		</div>
	</div>
</div>

<form method="POST" use:enhance id="snapshot-form">
	<!-- SNAPSHOT DATE -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2 mb-2">
			SNAPSHOT DATE
		</div>
		<div class="p-2 pt-0">
			<input
				type="date"
				id="snapshotDate"
				name="snapshotDate"
				value={data.defaultDate}
				required
				class="border border-black p-1 text-sm focus:outline-none"
			/>
			<p class="text-xs text-gray-600 mt-1 mb-0">Default is today. Edit if needed.</p>
			{#if form?.errors?.snapshotDate}
				<small class="text-red-700 font-bold text-xs block">{form.errors.snapshotDate}</small>
			{/if}
		</div>
	</div>

	<!-- FINANCIAL SUMMARY PREVIEW -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			FINANCIAL SUMMARY
		</div>
		<div class="p-2 pt-0 text-sm">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Net Worth:</span>
				<span class="font-bold">{formatCurrencyShorthand(data.preview.netWorth)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Total Assets:</span>
				<span>{formatCurrencyShorthand(data.preview.totalAssets)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Total Liabilities:</span>
				<span>{formatCurrencyShorthand(data.preview.totalLiabilities)}</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Total Allocated:</span>
				<span>{formatCurrencyShorthand(data.preview.totalAllocated)}</span>
			</div>
		</div>
	</div>

	<!-- ACCOUNTS PREVIEW -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			ACCOUNTS ({data.preview.accountsBreakdown.accounts.length})
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

	<!-- GOALS PREVIEW -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			GOALS ({data.preview.goalsBreakdown.goals.length})
		</div>
		<div class="p-2">
			{#each data.preview.goalsBreakdown.goals as goal}
				<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0">
					<span>{goal.name}</span>
					<span>
						{formatCurrencyShorthand(goal.currentAllocation)} /
						{formatCurrencyShorthand(goal.targetAmountInCents)}
					</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- NOTES -->
	<div class="">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			NOTES (OPTIONAL)
		</div>
		<div class="p-2">
			{#if form?.error}
				<p class="text-red-700 font-bold mb-2">{form.error}</p>
			{/if}

			<textarea
				id="notes"
				name="notes"
				rows="3"
				placeholder="Add context for this snapshot..."
				class="w-full border border-black p-1 text-sm focus:outline-none"
			></textarea>
			{#if form?.errors?.notes}
				<small class="text-red-700 font-bold text-xs block">{form.errors.notes}</small>
			{/if}
		</div>
	</div>
</form>
