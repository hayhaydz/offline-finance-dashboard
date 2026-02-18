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
	const isValid = $derived(() => {
		const nameValid = name.trim().length >= 3 && name.trim().length <= 100;
		const amountValid = targetAmount.match(/^(\d+)\.?(\d{0,2})?$/) !== null;
		return nameValid && amountValid;
	});

	// Set today as min date for target date
	const today = new Date().toISOString().split('T')[0];
</script>

<div class="max-w-md mx-auto">
	<!-- Header -->
	<div class="bg-black text-white p-2 flex justify-between items-center border border-black">
		<span class="text-sm font-bold">CREATE NEW GOAL</span>
		<a href="/goals" class="text-white hover:bg-gray-700 px-2 bracket-link">[Cancel]</a>
	</div>

	<!-- Form -->
	<form method="POST" use:enhance class="border border-black border-t-0">
		<!-- Name -->
		<div class="p-2 border-b border-black">
			<label class="font-bold text-xs block mb-1">GOAL NAME *</label>
			<input
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
		<div class="p-2 border-b border-black">
			<label class="font-bold text-xs block mb-1">TARGET AMOUNT *</label>
			<input
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
		<div class="p-2 border-b border-black">
			<label class="font-bold text-xs block mb-1">TARGET DATE (optional)</label>
			<input
				type="date"
				name="target_date"
				bind:value={targetDate}
				min={today}
				class="border border-black p-1 text-sm focus:outline-none"
				style="max-width: 150px;"
			/>
			{#if form?.errors?.target_date}
				<small class="text-red-700 font-bold text-xs block">{form.errors.target_date}</small>
			{/if}
			<div class="text-xs text-gray-600 mt-1">
				Leave blank for no deadline
			</div>
		</div>

		<!-- Emergency Fund Toggle -->
		<div class="p-2 border-b border-black">
			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					id="emergency-fund"
					name="is_emergency_fund"
					bind:checked={isEmergencyFund}
					value="true"
					class="m-0"
				/>
				<label for="emergency-fund" class="text-sm cursor-pointer">
					Enable Emergency Fund milestones
				</label>
			</div>
			<div class="text-xs text-gray-600 mt-1 ml-5">
				Shows 1mo, 3mo, 6mo, 12mo progress markers
			</div>
		</div>

		<!-- Footer -->
		<div class="p-2 bg-gray-100 border-t border-black flex gap-2">
			<a href="/goals" class="bracket-link flex-1 text-center py-1">[Cancel]</a>
			<button
				type="submit"
				class="bracket-link bg-black text-white hover:bg-gray-800 flex-1 py-1"
				disabled={!isValid()}
			>
				[Create Goal]
			</button>
		</div>

		<!-- Helper text -->
		{#if !isValid()}
			<div class="p-2 bg-gray-100 text-xs text-gray-600 border-t border-black">
				Enter goal name and target amount to enable
			</div>
		{/if}
	</form>
</div>
