<script lang="ts">
	import { enhance } from '$app/forms';
	import TerminalRadio from '$lib/components/ui/terminal-toggle/TerminalRadio.svelte';
	import TerminalCheckbox from '$lib/components/ui/terminal-toggle/TerminalCheckbox.svelte';
	import {
		required,
		minLength,
		monetary
	} from '$lib/validation/rules';
	import { formatCurrency } from '$lib/utils/currency';

	let { form } = $props<{ form: any }>();

	// Form field values initialized to empty
	let name = $state('');
	let targetAmount = $state('');
	let goalType = $state('');
	let targetDate = $state('');

	// Multi-select filter states using Map for checkbox tracking
	let accountTypeFilters = $state<Map<string, boolean>>(new Map());
	let liquidityFilters = $state<Map<string, boolean>>(new Map());

	// Sync with form data if returning from a failed submission
	$effect(() => {
		if (form?.data) {
			name = form.data.name || '';
			targetAmount = form.data.targetAmount || '';
			goalType = form.data.goalType || '';
			targetDate = form.data.targetDate || '';
		}
	});

	// Initialize checkbox states from form data
	$effect(() => {
		if (form?.data?.accountTypeFilters && form?.data?.liquidityFilters) {
			try {
				const parsedAccountTypes = JSON.parse(form.data.accountTypeFilters) as string[];
				const parsedLiquidity = JSON.parse(form.data.liquidityFilters) as string[];
				accountTypeFilters = new Map(parsedAccountTypes.map((t) => [t, true]));
				liquidityFilters = new Map(parsedLiquidity.map((l) => [l, true]));
			} catch (e) {
				console.error('Failed to parse filter data', e);
				accountTypeFilters = new Map();
				liquidityFilters = new Map();
			}
		}
	});

	// Goal type options
	const goalTypes = [
		{ value: 'emergency-fund', label: 'Emergency Fund' },
		{ value: 'house-deposit', label: 'House Deposit' },
		{ value: 'car', label: 'Car' },
		{ value: 'holiday', label: 'Holiday' },
		{ value: 'wedding', label: 'Wedding' },
		{ value: 'other', label: 'Other' }
	];

	// Account type options for multi-select
	const accountTypeOptions = [
		{ value: 'current', label: 'Current' },
		{ value: 'savings', label: 'Savings' },
		{ value: 'investment', label: 'Investment' },
		{ value: 'credit-card', label: 'Credit Card' },
		{ value: 'loan', label: 'Loan' },
		{ value: 'mortgage', label: 'Mortgage' }
	];

	// Liquidity options for multi-select
	const liquidityOptions = [
		{ value: 'instant', label: 'Instant Access' },
		{ value: 'delayed', label: 'Delayed Access' },
		{ value: 'locked', label: 'Locked' }
	];

	// Validation functions - return error strings without mutation
	function validateName(): string {
		if (!name.trim()) {
			return 'Goal name is required';
		}
		if (name.trim().length < 3) {
			return 'Goal name must be at least 3 characters';
		}
		if (name.trim().length > 100) {
			return 'Goal name must be 100 characters or less';
		}
		return '';
	}

	function validateTargetAmount(): string {
		const trimmed = targetAmount.trim();
		if (!trimmed) {
			return 'Target amount is required';
		}
		const match = trimmed.match(/^(\d+)\.?(\d{0,2})?$/);
		if (!match) {
			return 'Invalid amount format. Enter amount like 1000.00 or 1000';
		}
		const pounds = parseInt(match[1], 10);
		const pence = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0;
		const amountInCents = (pounds * 100) + pence;
		if (amountInCents <= 0) {
			return 'Target amount must be greater than zero';
		}
		return '';
	}

	function validateGoalType(): string {
		if (!goalType) {
			return 'Please select a goal type';
		}
		return '';
	}

	// Form is valid when all required fields are valid
	const isFormValid = $derived(validateName() === '' && validateTargetAmount() === '' && validateGoalType() === '');

	// Check if at least one account type is selected
	const hasAccountTypeFilter = $derived(
		Array.from(accountTypeFilters.values()).some((v) => v === true)
	);

	// Check if at least one liquidity is selected
	const hasLiquidityFilter = $derived(
		Array.from(liquidityFilters.values()).some((v) => v === true)
	);

	// Toggle account type filter
	function toggleAccountType(value: string) {
		const newMap = new Map(accountTypeFilters);
		newMap.set(value, !newMap.get(value));
		accountTypeFilters = newMap;
	}

	// Toggle liquidity filter
	function toggleLiquidity(value: string) {
		const newMap = new Map(liquidityFilters);
		newMap.set(value, !newMap.get(value));
		liquidityFilters = newMap;
	}

	// Get selected filter values for hidden inputs
	const selectedAccountTypes = $derived(
		Array.from(accountTypeFilters.entries())
			.filter(([_, v]) => v === true)
			.map(([k]) => k)
	);

	const selectedLiquidity = $derived(
		Array.from(liquidityFilters.entries())
			.filter(([_, v]) => v === true)
			.map(([k]) => k)
	);

	// Helper for checkbox row click
	function toggleWithCheck(key: string, currentMap: Map<string, boolean>) {
		const newState = new Map(currentMap);
		newState.set(key, !newState.get(key));
		return newState;
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">CREATE GOAL</h1>
	<p class="text-gray-600 my-1">Set a savings goal to track your progress</p>
</div>

<form
	method="POST"
	use:enhance={() => {
		return async ({ update }) => {
			await update();
		};
	}}
	class="border-b border-black p-2"
>
	<!-- Goal Name -->
	<div class="mb-1">
		<label for="name" class="font-bold text-xs block mb-1">Goal Name *</label>
		<input
			type="text"
			id="name"
			name="name"
			bind:value={name}
			placeholder="e.g., House Deposit"
			class="w-full border border-black px-2 py-1 text-sm focus:outline-none font-terminal"
			required
		/>
		{#if form?.errors?.name}
			<small class="text-red-700 font-bold text-xs block">{form.errors.name}</small>
		{/if}
	</div>

	<!-- Target Amount -->
	<div class="mb-1">
		<label for="targetAmount" class="font-bold text-xs block mb-1">Target Amount *</label>
		<input
			type="text"
			id="targetAmount"
			name="targetAmount"
			bind:value={targetAmount}
			placeholder="e.g., 10000.00"
			inputmode="numeric"
			class="w-full border border-black px-2 py-1 text-sm focus:outline-none font-terminal"
			required
		/>
		{#if form?.errors?.targetAmount}
			<small class="text-red-700 font-bold text-xs block">{form.errors.targetAmount}</small>
		{/if}
	</div>

	<!-- Goal Type -->
	<div class="mb-1">
		<span class="font-bold text-xs block mb-1">Goal Type *</span>
		<input type="hidden" name="goalType" value={goalType} />
		<div class="flex flex-col">
			{#each goalTypes as option}
				<TerminalRadio value={option.value} selectedValue={goalType} onChange={(v) => goalType = v}>
					<span class="text-sm">{option.label}</span>
				</TerminalRadio>
			{/each}
		</div>
		{#if form?.errors?.goalType}
			<small class="text-red-700 font-bold text-xs block">{form.errors.goalType}</small>
		{/if}
	</div>

	<!-- Target Date -->
	<div class="mb-1">
		<label for="targetDate" class="font-bold text-xs block mb-1">Target Date (optional)</label>
		<input
			type="date"
			id="targetDate"
			name="targetDate"
			bind:value={targetDate}
			class="w-full border border-black px-2 py-1 text-sm focus:outline-none font-terminal"
		/>
		{#if form?.errors?.targetDate}
			<small class="text-red-700 font-bold text-xs block">{form.errors.targetDate}</small>
		{/if}
	</div>

	<!-- Account Type Filters (Multi-select) -->
	<div class="mb-1 border border-black p-2">
		<span class="font-bold text-xs block mb-1">Account Type Filters</span>
		<div class="grid grid-cols-2 gap-1">
			{#each accountTypeOptions as option}
				<TerminalCheckbox
					value={option.value}
					checked={accountTypeFilters.get(option.value) || false}
					onChange={(checked) => {
						accountTypeFilters = new Map(accountTypeFilters).set(option.value, checked);
					}}
				>
					<span>{option.label}</span>
				</TerminalCheckbox>
			{/each}
		</div>
		<!-- Hidden input for form submission -->
		<input type="hidden" name="account_type_filters" value={JSON.stringify(selectedAccountTypes)} />
		{#if form?.errors?.accountTypeFilters}
			<small class="text-red-700 font-bold text-xs block">{form.errors.accountTypeFilters}</small>
		{/if}
	</div>

	<!-- Liquidity Filters (Multi-select) -->
	<div class="mb-1 border border-black p-2">
		<span class="font-bold text-xs block mb-1">Liquidity Filters</span>
		<div class="grid grid-cols-3 gap-1">
			{#each liquidityOptions as option}
				<TerminalCheckbox
					value={option.value}
					checked={liquidityFilters.get(option.value) || false}
					onChange={(checked) => {
						liquidityFilters = new Map(liquidityFilters).set(option.value, checked);
					}}
				>
					<span>{option.label}</span>
				</TerminalCheckbox>
			{/each}
		</div>
		<!-- Hidden input for form submission -->
		<input type="hidden" name="liquidity_filters" value={JSON.stringify(selectedLiquidity)} />
		{#if form?.errors?.liquidityFilters}
			<small class="text-red-700 font-bold text-xs block">{form.errors.liquidityFilters}</small>
		{/if}
	</div>

	<!-- Error Display -->
	{#if form?.error}
		<p class="text-red-700 font-bold my-2">{form.error}</p>
	{/if}

	<!-- Submit Button -->
	<div class="mb-2">
		<button
			type="submit"
			class="bracket-link"
			disabled={!isFormValid || !hasAccountTypeFilter || !hasLiquidityFilter}
		>
			Create Goal
		</button>
		<a href="/goals" class="bracket-link ml-2">Cancel</a>
	</div>
</form>
