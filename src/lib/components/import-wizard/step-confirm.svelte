<script lang="ts">
	import { enhance } from "$app/forms";
	import { type ParsedRow } from "$lib/utils/csv-parser";

	interface Account {
		id: number;
		slug: string;
		name: string;
		type: string;
	}

	interface Props {
		filteredRows: ParsedRow[];
		accounts: Array<Account>;
		accountId: number;
		onBack: () => void;
		onReset: () => void;
	}

	let { filteredRows, accounts, accountId, onBack }: Props = $props();

	let isSubmitting = $state(false);

	let account = $derived(accounts.find((a) => a.id === accountId));

	let netAmount = $derived(
		filteredRows.reduce((sum, row) => sum + row.amount, 0)
	);

	let displayRows = $derived(
		filteredRows.length > 50
			? { rows: filteredRows.slice(0, 50), overflow: filteredRows.length - 50 }
			: { rows: filteredRows, overflow: 0 }
	);

	function formatAmount(amount: number): string {
		return amount.toFixed(2);
	}

	function handleSubmit() {
		isSubmitting = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			isSubmitting = false;
		};
	}
</script>

<div class="p-4">
	<h2 class="font-bold text-lg mb-4">Step 4 of 4: Confirm Import</h2>

	<!-- Summary box -->
	<div class="border border-black bg-gray-50 p-2 mb-4">
		<div class="text-sm">
			<p class="mb-1">
				<span class="font-bold">Account:</span> {account?.name ?? "Unknown"}
			</p>
			<p class="mb-1">
				<span class="font-bold">Rows to import:</span> {filteredRows.length}
			</p>
			<p>
				<span class="font-bold">Net amount:</span> &pound;{formatAmount(netAmount)}
			</p>
		</div>
	</div>

	<!-- Preview table -->
	{#if displayRows.rows.length > 0}
		<div class="border border-black max-h-64 overflow-auto mb-4">
			<table class="w-full text-xs">
				<thead class="bg-gray-100">
					<tr class="border-b border-black">
						<th class="p-1 text-left">Date</th>
						<th class="p-1 text-left">Type</th>
						<th class="p-1 text-right">Amount</th>
						<th class="p-1 text-left">Description</th>
					</tr>
				</thead>
				<tbody>
					{#each displayRows.rows as row}
						<tr class="border-b border-black">
							<td class="p-1">{row.date}</td>
							<td class="p-1">{row.type ?? "-"}</td>
							<td class="p-1 text-right">{formatAmount(row.amount)}</td>
							<td class="p-1">{row.description}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if displayRows.overflow > 0}
			<p class="text-xs text-amber-600 mb-4">... and {displayRows.overflow} more</p>
		{/if}
	{/if}

	<!-- Import form -->
	<form method="POST" action="?/import" use:enhance={handleSubmit}>
		<input type="hidden" name="accountId" value={accountId} />
		<input type="hidden" name="rows" value={JSON.stringify(filteredRows)} />

		<div class="flex gap-2">
			<button type="button" onclick={onBack} class="bracket-link text-sm">
				Back
			</button>
			<button
				type="submit"
				disabled={isSubmitting}
				class="bracket-link text-sm {isSubmitting ? 'opacity-50 pointer-events-none' : ''}"
			>
				{#if isSubmitting}
					Importing...
				{:else}
					Confirm Import
				{/if}
			</button>
		</div>
	</form>
</div>
