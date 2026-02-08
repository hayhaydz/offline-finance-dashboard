<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/ui/form-field/form-field.svelte';
	import {
		required,
		maxLength,
		accountType,
		liquidity,
		monetary
	} from '$lib/validation/rules';

	let { form } = $props();

	// Form field values
	let name = $state(form?.data?.name || '');
	let type = $state(form?.data?.type || '');
	let institution = $state(form?.data?.institution || '');
	let liquidityValue = $state(form?.data?.liquidity || '');
	let initialBalance = $state(form?.data?.initialBalance || '');

	// Account type options
	const accountTypes = [
		{ value: 'current', label: 'Current Account' },
		{ value: 'savings', label: 'Savings Account' },
		{ value: 'credit', label: 'Credit Card' },
		{ value: 'investment', label: 'Investment Account' },
		{ value: 'ISA', label: 'ISA (UK)' },
		{ value: 'LISA', label: 'LISA (UK)' }
	];

	// Liquidity options
	const liquidityOptions = [
		{ value: 'instant', label: 'Instant Access' },
		{ value: 'delayed', label: 'Delayed Access' },
		{ value: 'locked', label: 'Locked' }
	];

	// Validation rules for each field
	const nameRules = [
		required(),
		maxLength(100)
	];

	const typeRules = [
		required(),
		accountType()
	];

	const institutionRules = [
		maxLength(100)
	];

	const liquidityRules = [
		liquidity()
	];

	const initialBalanceRules = [
		monetary()
	];

	// Form validation state
	let nameValid = $state(false);
	let typeValid = $state(false);
	let institutionValid = $state(true);  // Optional field
	let liquidityValid = $state(true);     // Optional field
	let initialBalanceValid = $state(true); // Optional field

	// Form is valid when all required fields are valid
	const isFormValid = $derived(
		nameValid && typeValid && institutionValid && liquidityValid && initialBalanceValid
	);

	// Component refs for validation access
	let nameField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let typeField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let institutionField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let liquidityField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let initialBalanceField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();

	// Update validation state when fields change
	$effect(() => {
		nameValid = nameField?.isValid ?? false;
		typeValid = typeField?.isValid ?? false;
		institutionValid = institutionField?.isValid ?? true;
		liquidityValid = liquidityField?.isValid ?? true;
		initialBalanceValid = initialBalanceField?.isValid ?? true;
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">CREATE ACCOUNT</h1>
	<p class="text-gray-600 my-1">Add a new financial account to track</p>
</div>

<form method="POST" use:enhance class="border-b border-black p-2">
	<FormField
		bind:this={nameField}
		label="Account Name"
		name="name"
		type="text"
		bind:value={name}
		rules={nameRules}
		placeholder="e.g., Chase Checking"
		autocomplete="off"
	/>

	<div class="mb-1">
		<label for="type" class="font-bold text-xs block mb-1">Account Type</label>
		<select
			id="type"
			name="type"
			bind:value={type}
			class="border border-black p-1 w-full font-terminal text-sm focus:outline-none"
			required
		>
			<option value="">Select account type...</option>
			{#each accountTypes as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{#if form?.errors?.type}
			<small class="text-red-700 font-bold text-xs block">{form.errors.type}</small>
		{/if}
	</div>

	<FormField
		bind:this={institutionField}
		label="Institution (optional)"
		name="institution"
		type="text"
		bind:value={institution}
		rules={institutionRules}
		placeholder="e.g., Chase Bank"
		autocomplete="off"
	/>

	<div class="mb-1">
		<label for="liquidity" class="font-bold text-xs block mb-1">Liquidity (optional)</label>
		<select
			id="liquidity"
			name="liquidity"
			bind:value={liquidityValue}
			class="border border-black p-1 w-full font-terminal text-sm focus:outline-none"
		>
			<option value="">Select liquidity...</option>
			{#each liquidityOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{#if form?.errors?.liquidity}
			<small class="text-red-700 font-bold text-xs block">{form.errors.liquidity}</small>
		{/if}
	</div>

	<FormField
		bind:this={initialBalanceField}
		label="Initial Balance (optional)"
		name="initialBalance"
		type="text"
		bind:value={initialBalance}
		rules={initialBalanceRules}
		placeholder="e.g., 1000.00"
		inputmode="numeric"
		autocomplete="off"
	/>

	{#if form?.error}
		<p class="text-red-700 font-bold my-2">{form.error}</p>
	{/if}

	<div class="mb-2">
		<button
			type="submit"
			disabled={!isFormValid}
			class="bracket-link"
		>
			Create Account
		</button>
		<a href="/accounts" class="bracket-link ml-2">Cancel</a>
	</div>
</form>
