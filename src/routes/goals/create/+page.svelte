<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form } = $props<{
		form: ActionData;
	}>();

	let name = $state('');
	let targetAmount = $state('');
	let targetDate = $state('');
	let isEmergencyFund = $state(false);

	// Form validation state
	const isValid = $derived.by(() => {
		const nameValid = name.trim().length >= 3 && name.trim().length <= 100;
		const amountValid = targetAmount.match(/^(\d+)\.?(\d{0,2})?$/) !== null;
		return nameValid && amountValid;
	});

	// Set today as min date for target date
	const today = new Date().toISOString().split('T')[0];
</script>

<div class="border-b border-black p-2 flex justify-between items-center">
	<div>
		<h1 class="text-lg font-bold mb-0 mt-0">CREATE NEW GOAL</h1>
		<p class="text-gray-600 my-0 text-xs">Set a savings target to track your progress</p>
	</div>
	<div class="flex gap-2">
		<button type="submit" form="goal-create-form" class="bracket-link" disabled={!isValid}>Create Goal</button>
		<a href="/goals" class="bracket-link">Cancel</a>
	</div>
</div>

<!-- v3.1 third-mandate: 2-column field ledger (was a narrow vertical stack
     that ignored the viewport) -->
<form method="POST" use:enhance id="goal-create-form" class="p-2">
	<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 border border-black p-3">
		<!-- Name -->
		<div>
			<label for="goal-name" class="font-bold text-xs block mb-1">GOAL NAME *</label>
			<input
				id="goal-name"
				type="text"
				name="name"
				bind:value={name}
				placeholder="e.g., Holiday Fund, Wedding, Car"
				class="w-full border border-black p-1 text-sm focus:outline-none"
			/>
			{#if form?.errors?.name}
				<small class="text-red-700 font-bold text-xs block">{form.errors.name}</small>
			{/if}
		</div>

		<!-- Target Amount -->
		<div>
			<label for="target-amount" class="font-bold text-xs block mb-1">TARGET AMOUNT *</label>
			<input
				id="target-amount"
				type="text"
				name="target_amount"
				bind:value={targetAmount}
				placeholder="e.g., 5000"
				class="w-full border border-black p-1 text-sm font-bold focus:outline-none"
			/>
			{#if form?.errors?.target_amount}
				<small class="text-red-700 font-bold text-xs block">{form.errors.target_amount}</small>
			{/if}
		</div>

		<!-- Target Date (Optional) -->
		<div>
			<label for="target-date" class="font-bold text-xs block mb-1">TARGET DATE (optional)</label>
			<input
				id="target-date"
				type="date"
				name="target_date"
				bind:value={targetDate}
				min={today}
				class="w-full border border-black p-1 text-sm focus:outline-none"
			/>
			{#if form?.errors?.target_date}
				<small class="text-red-700 font-bold text-xs block">{form.errors.target_date}</small>
			{/if}
			<div class="text-xs text-gray-600 mt-1">
				Leave blank for no deadline
			</div>
		</div>

		<!-- Emergency Fund Toggle -->
		<div class="flex flex-col justify-center">
			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					id="emergency-fund"
					name="is_emergency_fund"
					bind:checked={isEmergencyFund}
					value="true"
					class="m-0 cursor-pointer"
				/>
				<label for="emergency-fund" class="text-sm cursor-pointer">
					Enable Emergency Fund milestones
				</label>
			</div>
			<div class="text-xs text-gray-600 mt-1 ml-5">
				Shows 1mo, 3mo, 6mo, 12mo progress markers
			</div>
		</div>
	</div>

	{#if form?.error}
		<p class="text-red-700 font-bold my-2">{form.error}</p>
	{/if}
</form>
