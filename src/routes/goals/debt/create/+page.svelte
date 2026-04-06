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

	let linkedAccountId = $state(form?.data?.linkedAccountId ?? "");
	let name = $state(form?.data?.name ?? "");
	let targetDate = $state(form?.data?.targetDate ?? "");
</script>

<div class="p-4 max-w-2xl">
	<h1 class="text-xl font-bold mb-4">Create Debt Payoff Goal</h1>

	{#if form?.error}
		<p class="text-red-600 text-sm mb-4">{form.error}</p>
	{/if}

	<form method="POST" class="space-y-4" use:enhance>
		<div>
			<label for="linked_account_id" class="block text-sm font-bold mb-1">
				Liability Account *
			</label>
			<select
				id="linked_account_id"
				name="linked_account_id"
				bind:value={linkedAccountId}
				class="w-full border border-black p-2"
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

		<div>
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

		<div class="border border-black p-3 bg-gray-50 text-sm">
			<p class="font-bold mb-1">Note:</p>
			<ul class="list-disc list-inside space-y-1">
				<li>Starting balance will be captured from the account's current balance</li>
				<li>Default milestones will be created: 25%, 50%, 75%, Paid off</li>
				<li>This is a tracker only — no money is allocated</li>
			</ul>
		</div>

		<div class="flex gap-2 pt-2">
			<button type="submit" class="bracket-link text-sm">Create Goal</button>
			<a href="/goals/debt" class="bracket-link text-sm">Cancel</a>
		</div>
	</form>
</div>
