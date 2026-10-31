<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	interface FormErrors {
		linked_account_id?: string;
		name?: string;
		target_date?: string;
	}

	interface FormData {
		linkedAccountId: string;
		name: string;
		targetDate: string;
	}

	interface ActionData {
		error: string;
		errors?: FormErrors;
		data?: FormData;
	}

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let linkedAccountId = $state("");
	let name = $state("");
	let targetDate = $state("");
	$effect(() => {
		if (form?.data) {
			linkedAccountId = form.data.linkedAccountId ?? "";
			name = form.data.name ?? "";
			targetDate = form.data.targetDate ?? "";
		}
	});
</script>

<div class="border-b border-black p-2 flex justify-between items-center">
	<h1 class="text-lg font-bold m-0">CREATE DEBT PAYOFF GOAL</h1>
	<div class="flex gap-2">
		<button type="submit" form="debt-create-form" class="bracket-link text-sm">Create Goal</button>
		<a href="/goals/debt" class="bracket-link text-sm">Cancel</a>
	</div>
</div>

<!-- v3.1 third-mandate: 2-col field ledger + note panel (was vertical stack) -->
<form method="POST" id="debt-create-form" class="p-2 grid grid-cols-1 lg:grid-cols-3 gap-2 items-start" use:enhance>
	<div class="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 border border-black p-3">
		<div>
			<label for="linked_account_id" class="block text-sm font-bold mb-1">
				Liability Account *
			</label>
			<select
				id="linked_account_id"
				name="linked_account_id"
				bind:value={linkedAccountId}
				class="w-full border border-black p-2 cursor-pointer"
				required
			>
				<option value="">Select an account...</option>
				{#each data.availableAccounts as account}
					<option value={account.id}>{account.name}</option>
				{/each}
			</select>
			{#if form?.errors?.linked_account_id}
				<p class="text-red-600 text-xs mt-1">{form.errors.linked_account_id}</p>
			{/if}
		</div>

		<div>
			<label for="name" class="block text-sm font-bold mb-1">
				Goal Name *
			</label>
			<input
				id="name"
				name="name"
				type="text"
				bind:value={name}
				class="w-full border border-black p-2"
				maxlength="100"
				required
			/>
			{#if form?.errors?.name}
				<p class="text-red-600 text-xs mt-1">{form.errors.name}</p>
			{/if}
		</div>

		<div class="md:col-span-2">
			<label for="target_date" class="block text-sm font-bold mb-1">
				Target Date (when you want to be debt-free)
			</label>
			<input
				id="target_date"
				name="target_date"
				type="date"
				bind:value={targetDate}
				class="w-full border border-black p-2"
			/>
			{#if form?.errors?.target_date}
				<p class="text-red-600 text-xs mt-1">{form.errors.target_date}</p>
			{/if}
		</div>
	</div>

	<div class="border border-black p-3 bg-gray-50 text-sm self-stretch">
		<p class="font-bold mb-1">Note:</p>
		<ul class="list-disc list-inside space-y-1">
			<li>Starting balance will be captured from the account's current balance</li>
			<li>Default milestones will be created: 25%, 50%, 75%, Paid off</li>
			<li>This is a tracker only — no money is allocated</li>
		</ul>
	</div>

	{#if form?.error}
		<p class="text-red-600 text-sm lg:col-span-3">{form.error}</p>
	{/if}
</form>
