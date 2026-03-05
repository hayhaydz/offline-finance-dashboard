<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/ui/form-field/form-field.svelte';
	import TerminalRadio from '$lib/components/ui/terminal-toggle/TerminalRadio.svelte';
	import {
		required,
		maxLength,
		accountType,
		liquidity,
		monetary
	} from '$lib/validation/rules';
	import {
		devLogClient,
		logComponentLifecycle,
		logValidationState,
		logFormSubmit,
		logFormDataClient
	} from '$lib/utils/client-logger';

	let { form } = $props<{ form: any }>();

	// Log component lifecycle
	logComponentLifecycle('account-create', 'AccountCreateForm', 'mount');

	// Form field values initialized to empty
	let name = $state('');
	let type = $state('');
	let taxWrapper = $state('none');
	let institution = $state('');
	let liquidityValue = $state('');
	let initialBalance = $state('');

	// Sync with form data if returning from a failed submission
	$effect(() => {
		if (form?.data) {
			name = form.data.name ?? '';
			type = form.data.type ?? '';
			taxWrapper = form.data.taxWrapper ?? 'none';
			institution = form.data.institution ?? '';
			liquidityValue = form.data.liquidity ?? '';
			initialBalance = form.data.initialBalance ?? '';
		}
	});

	// Log form value changes for debugging
	$effect(() => {
		devLogClient('account-create', 'Form values changed', {
			name,
			type,
			taxWrapper,
			institution,
			liquidityValue,
			initialBalance
		});
	});

	// Account type options (6 core types)
	const accountTypes = [
		{ value: 'current', label: 'Current' },
		{ value: 'savings', label: 'Savings' },
		{ value: 'investment', label: 'Investment' },
		{ value: 'credit-card', label: 'Credit Card' },
		{ value: 'loan', label: 'Loan' },
		{ value: 'mortgage', label: 'Mortgage' }
	];

	// Tax wrapper options (4 values)
	const taxWrappers = [
		{ value: 'none', label: 'None' },
		{ value: 'isa', label: 'ISA' },
		{ value: 'lisa', label: 'LISA' },
		{ value: 'premium-bonds', label: 'Premium Bonds' }
	];

	// Tax wrapper only enabled for savings/investment
	const taxWrapperEnabled = $derived(
		type === 'savings' || type === 'investment'
	);

	// Auto-reset tax wrapper when type changes to invalid combination
	$effect(() => {
		if (!taxWrapperEnabled && taxWrapper !== 'none') {
			taxWrapper = 'none';
		}
	});

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

		logValidationState('account-create', {
			nameValid,
			typeValid,
			institutionValid,
			liquidityValid,
			initialBalanceValid,
			isFormValid: nameValid && typeValid && institutionValid && liquidityValid && initialBalanceValid
		});
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">CREATE ACCOUNT</h1>
	<p class="text-gray-600 my-1">Add a new financial account to track</p>
</div>

<form
	method="POST"
	use:enhance={() => {
		return async ({ result, update }) => {
			logFormSubmit('account-create', 'CreateAccount', { result });
			await update();
		};
	}}
	class="border-b border-black p-2"
>
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
		<span class="font-bold text-xs block mb-1">Account Type</span>
		<div class="flex flex-col">
			{#each accountTypes as option}
				<TerminalRadio value={option.value} selectedValue={type} onChange={(v) => type = v}>
					<span class="text-sm">{option.label}</span>
				</TerminalRadio>
			{/each}
		</div>
		{#if form?.errors?.type}
			<small class="text-red-700 font-bold text-xs block">{form.errors.type}</small>
		{/if}
	</div>

	<div class="mb-1">
		<span class="font-bold text-xs block mb-1">Tax Wrapper</span>
		<div class="flex flex-col">
			{#each taxWrappers as option}
				<TerminalRadio
					value={option.value}
					selectedValue={taxWrapper}
					onChange={(v) => taxWrapper = v}
					disabled={!taxWrapperEnabled && option.value !== 'none'}
				>
					<span class="text-sm {taxWrapperEnabled || option.value === 'none' ? '' : 'text-gray-500'}">
						{option.label}
						{#if !taxWrapperEnabled && option.value !== 'none'}
							(unavailable)
						{/if}
					</span>
				</TerminalRadio>
			{/each}
		</div>
		{#if form?.errors?.taxWrapper}
			<small class="text-red-700 font-bold text-xs block">{form.errors.taxWrapper}</small>
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
			class="bracket-link"
			onclick={() => devLogClient('account-create', 'Submit button clicked', { isFormValid })}
		>
			Create Account
		</button>
		<a href="/accounts" class="bracket-link ml-2">Cancel</a>
	</div>
</form>
