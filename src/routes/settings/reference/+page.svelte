<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/ui/form-field/form-field.svelte';
	import SettingsNav from '$lib/components/SettingsNav.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { required, monetary } from '$lib/validation/rules';

	let { data, form } = $props();

	// Form state - initialize from server data (pence to pounds)
	let monthlyExpenses = $state('');

	// Sync state when server data changes
	$effect(() => {
		monthlyExpenses =
			data.monthlyExpensesInPence !== null && data.monthlyExpensesInPence !== undefined
				? (data.monthlyExpensesInPence / 100).toFixed(2)
				: '';
	});

	// Validation rules for monthly expenses
	const validationRules = [
		required('Monthly expenses amount is required'),
		monetary('Enter amount like 2000 or 2000.00')
	];

	// Form field reference for validation
	let formFieldRef: {
		validate: () => boolean;
		touch: () => void;
	} | null = null;

	// Check if form should show success
	const showSuccess = $derived(form?.success === true);

	// Current value display
	const currentDisplay = $derived(
		data.monthlyExpensesInPence ? formatCurrency(data.monthlyExpensesInPence) : null
	);

	// Check if form is valid for submit button
	const isFormValid = $derived(() => {
		if (!formFieldRef) return false;
		return formFieldRef.validate();
	});
</script>

<main>
	<SettingsNav current="reference" />
		<!-- MONTHLY EXPENSES CONFIGURATION SECTION -->
		<section>
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>MONTHLY EXPENSES CONFIGURATION</span>
			</div>

			<div class="bg-gray-50 p-4">
				<!-- Current value display -->
				{#if currentDisplay}
					<div class="mb-4 pb-4 border-b border-gray-300">
						<div class="flex justify-between my-1">
							<span><strong>Current monthly expenses:</strong></span>
							<span class="font-mono">{currentDisplay}</span>
						</div>
					</div>
				{/if}

				<!-- Help text -->
				<div class="mb-4">
					<h2 class="mt-0 mb-2">Monthly Essential Expenses</h2>
					<p class="text-sm mb-2">
						This amount is used to calculate Emergency Fund milestone targets:
					</p>
					<ul class="text-sm mb-2 ml-4">
						<li><strong>1 month:</strong> expenses / 12</li>
						<li><strong>3 months:</strong> expenses × 3 / 12</li>
						<li><strong>6 months:</strong> expenses × 6 / 12</li>
						<li><strong>12 months:</strong> expenses (full year)</li>
					</ul>
					<p class="text-sm mb-0">
						<strong>Example:</strong> If you spend £2,000/month, your 3-month emergency
						fund target is £6,000.
					</p>
				</div>

				<!-- Success message -->
				{#if showSuccess}
					<p class="text-green-700 font-bold text-sm mb-4">
						Monthly expenses updated successfully.
					</p>
				{/if}

				<!-- Form -->
				<form method="POST" use:enhance class="mb-4">
					<div class="mb-4">
						<FormField
							bind:this={formFieldRef}
							label="Monthly Essential Expenses (£)"
							name="monthlyExpenses"
							type="text"
							inputmode="numeric"
							placeholder="2000.00"
							bind:value={monthlyExpenses}
							rules={validationRules}
							filter={(value) => {
								// Allow only digits and decimal point
								return value.replace(/[^\d.]/g, '');
							}}
						/>
					</div>

					<button
						type="submit"
						class="bracket-link"
						disabled={showSuccess}
						class:opacity-50={showSuccess}
					>
						[Save Monthly Expenses]
					</button>
				</form>

				<!-- Info note -->
				<p class="text-xs text-gray-600 mt-4 mb-0">
					<strong>Note:</strong> This is a reference value only. Changing it does NOT
					retroactively update existing Emergency Fund goals (goal targets are set at
					creation time).
				</p>
			</div>
		</section>
</main>
