<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Get today's date in YYYY-MM-DD format for max attribute
	const today = new Date().toISOString().split('T')[0];

	// Format balance from cents to decimal string for input
	function formatBalanceForInput(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	// Get account type display name
	function getAccountType(type: string): string {
		const types: Record<string, string> = {
			current: 'Current',
			savings: 'Savings',
			credit: 'Credit',
			investment: 'Investment',
			ISA: 'ISA',
			LISA: 'LISA'
		};
		return types[type] || type;
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">EDIT BALANCE ENTRY</h1>
</div>

<!-- ACCOUNT INFO -->
<div class="border-b border-black p-2 bg-gray-100">
	<div class="text-sm">
		<span class="font-bold">Account:</span> {data.account.name}
		<span class="text-gray-600 mx-2">|</span>
		<span class="font-bold">Type:</span> {getAccountType(data.account.type)}
	</div>
</div>

<!-- WARNING NOTICE -->
<div class="border-b border-black p-2 bg-amber-50 border-l-4 border-l-amber-500">
	<div class="flex items-start gap-2">
		<span class="font-bold text-amber-900">WARNING:</span>
		<p class="text-sm m-0">
			Editing historical balance entries affects net worth calculations. Only make corrections when
			necessary.
		</p>
	</div>
</div>

<!-- EDIT FORM -->
<div class="p-2">
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<form method="POST" action="?/updateBalanceEntry" use:enhance class="flex flex-col gap-4">
		<div>
			<label for="balance" class="block text-sm font-bold mb-1">Balance</label>
			<input
				type="text"
				id="balance"
				name="balance"
				value={formatBalanceForInput(data.balance.balanceInCents)}
				placeholder="123.45"
				required
				class="w-full max-w-xs border border-black px-2 py-1 text-sm font-mono"
			/>
			<div class="text-xs text-gray-600 mt-1">Current value: {formatCurrency(data.balance.balanceInCents)}</div>
		</div>

		<div>
			<label for="asOfDate" class="block text-sm font-bold mb-1">As-of Date</label>
			<input
				type="date"
				id="asOfDate"
				name="asOfDate"
				value={data.asOfDateStr}
				max={today}
				required
				class="w-full max-w-xs border border-black px-2 py-1 text-sm"
			/>
			<div class="text-xs text-gray-600 mt-1">Future dates are not allowed</div>
		</div>

		<div>
			<label for="notes" class="block text-sm font-bold mb-1">Notes</label>
			<textarea
				id="notes"
				name="notes"
				rows="3"
				class="w-full max-w-md border border-black px-2 py-1 text-sm font-mono"
			>{data.balance.notes || ''}</textarea
			>
			<div class="text-xs text-gray-600 mt-1">Optional notes about this balance entry</div>
		</div>

		<div class="flex gap-2">
			<button
				type="submit"
				class="bg-black text-white px-4 py-2 text-sm font-bold hover:bg-gray-800"
			>
				Update Balance
			</button>
			<a
				href="/accounts/{data.account.slug}"
				class="border border-black px-4 py-2 text-sm hover:bg-gray-100 no-underline text-black"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
