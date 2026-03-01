<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import type { PageData, ActionData } from './$types';

	let { data, form } = $props<{
		data: PageData;
		form: ActionData;
	}>();

	let amount = $state('');
	let selectedAccountId = $state<string | null>(null);

	// Quick amount buttons per user decision
	const quickAmounts = [
		{ label: '£100', value: 10000 },
		{ label: '£500', value: 50000 },
		{ label: '£1k', value: 100000 },
		{ label: '£2k', value: 200000 }
	];

	// Calculate preview
	const preview = $derived.by(() => {
		if (!amount || !selectedAccountId) return null;

		const amountInCents = parseInt(amount) * 100;
		const selectedAccount = data.accounts.find((a: any) => a.id.toString() === selectedAccountId);
		const newGoalBalance = data.goal.currentAllocation + amountInCents;

		// Ready to Assign after = current readyToAssign - amount
		// Calculate current readyToAssign from totalAssets - totalAllocated
		const currentTotalAllocated = data.totalAssets - data.readyToAssign;
		const newTotalAllocated = currentTotalAllocated + amountInCents;
		const readyToAssignAfter = data.totalAssets - newTotalAllocated;

		return {
			amount: amountInCents,
			fromAccount: selectedAccount?.name || 'Unknown',
			newGoalBalance,
			readyToAssignAfter
		};
	});

	function setQuickAmount(value: number) {
		amount = (value / 100).toString();
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">ADD MONEY: {data.goal.name}</h1>
</div>

<div class="p-2">
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<form method="POST" use:enhance class="flex flex-col gap-4">
		<!-- Goal Info -->
		<div class="text-center mb-4 pb-4 border-b border-black">
			<div class="font-bold">{data.goal.name}</div>
			<div class="text-xs text-gray-600 mt-1">
				Currently: {formatCurrency(data.goal.currentAllocation)} of {formatCurrency(data.goal.targetAmountInCents)} target
			</div>
		</div>

		<!-- Amount Input -->
		<div>
			<label for="amount" class="block text-sm font-bold mb-1">AMOUNT</label>
			<input
				type="text"
				id="amount"
				name="amount"
				bind:value={amount}
				placeholder="£0"
				class="w-full max-w-md border border-black px-2 py-1 text-sm font-mono"
				inputmode="numeric"
			/>
			<div class="flex gap-1 mt-2">
				{#each quickAmounts as qa}
					<button
						type="button"
						onclick={() => setQuickAmount(qa.value)}
						class="px-2 py-1 border border-black text-xs hover:bg-gray-200"
					>
						{qa.label}
					</button>
				{/each}
			</div>
			{#if form?.errors?.amount}
				<small class="text-red-700 font-bold text-xs block">{form.errors.amount}</small>
			{/if}
		</div>

		<!-- Account Selection -->
		<fieldset>
			<legend class="block text-sm font-bold mb-1">FROM ACCOUNT</legend>
			{#each data.accounts as account}
				<label class="flex items-center p-2 cursor-pointer hover:bg-gray-100 border border-black mb-1">
					<input
						type="radio"
						name="from_account_id"
						value={account.id}
						bind:group={selectedAccountId}
						class="mr-2"
					/>
					<span class="flex-1 text-sm">{account.name}</span>
					<span class="text-xs text-gray-600">{formatCurrency(account.unallocated)} unallocated</span>
				</label>
			{/each}
			{#if form?.errors?.from_account_id}
				<small class="text-red-700 font-bold text-xs block">{form.errors.from_account_id}</small>
			{/if}
		</fieldset>

		<!-- Preview -->
		{#if preview}
			<div class="bg-gray-100 border border-black p-3">
				<div class="flex justify-between text-xs mb-1">
					<span>Adding:</span>
					<span class="text-green-700">+{formatCurrency(preview.amount)}</span>
				</div>
				<div class="flex justify-between text-xs mb-1">
					<span>From:</span>
					<span>{preview.fromAccount}</span>
				</div>
				<div class="flex justify-between text-xs mb-1">
					<span>Goal new balance:</span>
					<span>{formatCurrency(preview.newGoalBalance)}</span>
				</div>
				<div class="flex justify-between text-xs">
					<span>Ready to Assign after:</span>
					<span class="font-bold">{formatCurrency(preview.readyToAssignAfter)}</span>
				</div>
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<button
				type="submit"
				class="bg-black text-white px-4 py-2 text-sm font-bold hover:bg-gray-800"
				disabled={!preview}
			>
				[Add {amount ? `£${amount}` : '£0'}]
			</button>
			<a
				href="/goals/{data.goal.slug}"
				class="border border-black px-4 py-2 text-sm hover:bg-gray-100 no-underline text-black"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
