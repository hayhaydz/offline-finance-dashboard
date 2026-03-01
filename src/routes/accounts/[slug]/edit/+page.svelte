<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
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

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Log component lifecycle
	logComponentLifecycle('account-edit', 'AccountEditForm', 'mount');

	// Form field values - initialize with current account data
	// Use getter function to avoid reference capture warning
	const getInitialName = () => data.account.name;
	const getInitialType = () => data.account.type;
	const getInitialTaxWrapper = () => data.account.taxWrapper;
	const getInitialInstitution = () => data.account.institution || '';
	const getInitialLiquidity = () => data.account.liquidity || '';

	let name = $state(getInitialName());
	let type = $state<string>(getInitialType());
	let taxWrapper = $state<string>(getInitialTaxWrapper());
	let institution = $state(getInitialInstitution());
	let liquidityValue = $state(getInitialLiquidity());

	// Log form value changes for debugging
	$effect(() => {
		devLogClient('account-edit', 'Form values changed', {
			name,
			type,
			taxWrapper,
			institution,
			liquidityValue
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

	// Tax wrapper options (3 values)
	const taxWrappers = [
		{ value: 'none', label: 'None' },
		{ value: 'isa', label: 'ISA' },
		{ value: 'lisa', label: 'LISA' }
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

	// Form validation state
	let nameValid = $state(false);
	let typeValid = $state(false);
	let institutionValid = $state(true);  // Optional field
	let liquidityValid = $state(true);     // Optional field

	// Form is valid when all required fields are valid
	const isFormValid = $derived(
		nameValid && typeValid && institutionValid && liquidityValid
	);

	// Component refs for validation access
	let nameField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let typeField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let institutionField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let liquidityField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();

	// Update validation state when fields change
	$effect(() => {
		nameValid = nameField?.isValid ?? false;
		typeValid = typeField?.isValid ?? false;
		institutionValid = institutionField?.isValid ?? true;
		liquidityValid = liquidityField?.isValid ?? true;

		logValidationState('account-edit', {
			nameValid,
			typeValid,
			institutionValid,
			liquidityValid,
			isFormValid: nameValid && typeValid && institutionValid && liquidityValid
		});
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">EDIT ACCOUNT</h1>
	<p class="text-gray-600 my-1 truncate">Update account details for {data.account.name}</p>
</div>

<form
	method="POST"
	action="?/updateAccount"
	use:enhance={() => {
		return async ({ result, update }) => {
			logFormSubmit('account-edit', 'UpdateAccount', { result });
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
	</div>

	{#if form?.error}
		<p class="text-red-700 font-bold my-2">{form.error}</p>
	{/if}

	<div class="mb-2">
		<button
			type="submit"
			class="bracket-link"
			onclick={() => devLogClient('account-edit', 'Submit button clicked', { isFormValid })}
		>
			Update Account
		</button>
		<a href="/accounts/{data.account.slug}" class="bracket-link ml-2">Cancel</a>
	</div>
</form>

<div class="border-b border-black p-2">
	<p class="text-sm text-gray-600 mb-2">Need to remove this account?</p>
	<a href="/accounts/{data.account.slug}/delete" class="bracket-link text-sm text-red-700">
		Close Account
	</a>
	<div class="text-xs text-gray-500 mt-1">
		Closing an account hides it from the main view but preserves all balance history.
	</div>
</div>
