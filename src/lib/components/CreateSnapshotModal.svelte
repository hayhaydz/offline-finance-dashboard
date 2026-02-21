<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SnapshotPreviewData } from '$lib/utils/snapshots';
	import { formatCurrencyShorthand } from '$lib/utils/currency';

	interface Props {
		preview: SnapshotPreviewData;
		defaultDate: string;
		form?: { error?: string; existingSlug?: string } | null;
		onClose: () => void;
	}

	let { preview, defaultDate, form, onClose }: Props = $props();

	// Group accounts by type for preview
	const accountsByType = $derived(() => {
		const groups: Record<string, typeof preview.accountsBreakdown.accounts> = {};
		preview.accountsBreakdown.accounts.forEach((account) => {
			if (!groups[account.type]) {
				groups[account.type] = [];
			}
			groups[account.type].push(account);
		});
		return groups;
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
	class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
>
	<div class="bg-white border border-black max-w-2xl w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
		<div class="bg-black text-white p-3 flex justify-between items-center">
			<h2 class="m-0 text-lg">Create Snapshot - Preview</h2>
			<button onclick={onClose} class="text-white hover:text-gray-300">[Close]</button>
		</div>

		<div class="p-6">
			{#if form?.error}
				<div class="mb-4 p-3 bg-red-50 border border-red-700 text-red-700 text-sm">
					{form.error}
					{#if form?.existingSlug}
						<a href="/snapshots" class="underline ml-2">View existing snapshot</a>
					{/if}
				</div>
			{/if}

			<form method="POST" action="?/createSnapshot" use:enhance>
				<div class="mb-6">
					<label class="block font-bold mb-2" for="snapshotDate">Snapshot Date</label>
					<input
						type="date"
						id="snapshotDate"
						name="snapshotDate"
						value={defaultDate}
						required
						class="w-full border border-gray-300 p-2"
					/>
					<p class="text-xs text-gray-600 mt-1 mb-0">Edit the date if needed. Default is today.</p>
				</div>

				<div class="mb-6 bg-gray-50 border border-black p-4">
					<h3 class="font-bold mb-3 text-sm">FINANCIAL SUMMARY</h3>
					<div class="grid grid-cols-2 gap-4 text-sm">
						<div>
							<span class="text-gray-600">Net Worth:</span>
							<span class="ml-2 font-bold">{formatCurrencyShorthand(preview.netWorth)}</span>
						</div>
						<div>
							<span class="text-gray-600">Total Assets:</span>
							<span class="ml-2">{formatCurrencyShorthand(preview.totalAssets)}</span>
						</div>
						<div>
							<span class="text-gray-600">Total Liabilities:</span>
							<span class="ml-2">{formatCurrencyShorthand(preview.totalLiabilities)}</span>
						</div>
						<div>
							<span class="text-gray-600">Total Allocated:</span>
							<span class="ml-2">{formatCurrencyShorthand(preview.totalAllocated)}</span>
						</div>
					</div>
				</div>

				<div class="mb-6">
					<h3 class="font-bold mb-3 text-sm">ACCOUNTS ({preview.accountsBreakdown.accounts.length})</h3>
					<div class="bg-gray-50 border border-black p-4 max-h-60 overflow-y-auto">
						{#each Object.entries(accountsByType()) as [type, accounts]}
							<div class="mb-3">
								<div class="font-bold text-xs mb-1">{type} ({accounts.length})</div>
								{#each accounts as account}
									<div class="text-xs flex justify-between py-1">
										<span>{account.name}</span>
										<span
											class={account.includedInTotal ? '' : 'text-gray-400'}
										>
											{formatCurrencyShorthand(account.balanceInCents)}
											{!account.includedInTotal ? ' (excluded)' : ''}
										</span>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>

				<div class="mb-6">
					<h3 class="font-bold mb-3 text-sm">GOALS ({preview.goalsBreakdown.goals.length})</h3>
					<div class="bg-gray-50 border border-black p-4 max-h-60 overflow-y-auto">
						{#each preview.goalsBreakdown.goals as goal}
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

				<div class="mb-6">
					<label class="block font-bold mb-2" for="notes">Notes (optional)</label>
					<textarea
						id="notes"
						name="notes"
						rows="3"
						placeholder="Add context for this snapshot..."
						class="w-full border border-gray-300 p-2 text-sm"
					></textarea>
				</div>

				<div class="flex justify-end gap-4">
					<button type="button" onclick={onClose} class="bracket-link">[Cancel]</button>
					<button type="submit" class="bracket-link">[Create Snapshot]</button>
				</div>
			</form>
		</div>
	</div>
</div>
