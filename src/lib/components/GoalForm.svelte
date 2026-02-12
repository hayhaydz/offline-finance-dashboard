<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		required,
		minLength,
		monetary
	} from '$lib/validation/rules';
	import type { Goal } from '$lib/db/schema';
	import { formatCurrency } from '$lib/utils/currency';
	import { formatGoalProgress, getMilestonePositions, formatEmergencyFundRuler, getDaysRemaining } from '$lib/utils/goals';

	interface Props {
		/** Goal object for edit mode (undefined for create) */
		goal?: Goal | null;
		/** URL for form submission */
		formAction: string;
		/** Submit button label */
		submitLabel: string;
		/** Optional error data from failed submission */
		form?: {
			error?: string;
			errors?: Record<string, string>;
			data?: {
				name?: string;
				targetAmount?: string;
				isEmergencyFund?: string;
				targetDate?: string;
				accountTypeFilters?: string;
				liquidityFilters?: string;
			};
		};
	}

	let { goal = null, formAction, submitLabel, form }: Props = $props();

	// Form field values - initialize with empty defaults, then sync with props/form data
	let name = $state('');
	let targetAmount = $state('');
	let isEmergencyFund = $state(false);
	let targetDate = $state('');
	let nameError = $state('');
	let targetAmountError = $state('');
	let targetDateError = $state('');
	let accountTypeFiltersError = $state('');
	let liquidityFiltersError = $state('');

	// Multi-select filter states using Map for checkbox tracking
	// Account types: current, savings, investment, credit-card, loan, mortgage
	let accountTypeFilters = $state<Map<string, boolean>>(new Map());
	// Liquidity: instant, delayed, locked
	let liquidityFilters = $state<Map<string, boolean>>(new Map());

	// Sync with goal or form data when props change
	$effect(() => {
		if (goal) {
			// Edit mode: use goal data
			name = goal.name;
			targetAmount = formatCurrency(goal.targetAmountInCents);
			isEmergencyFund = goal.isEmergencyFund || false;
			targetDate = goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '';
			// Reset errors
			nameError = '';
			targetAmountError = '';
			targetDateError = '';
			accountTypeFiltersError = '';
			liquidityFiltersError = '';
		} else if (form?.data) {
			// Restore from failed submission
			name = form.data.name || '';
			targetAmount = form.data.targetAmount || '';
			isEmergencyFund = form.data.isEmergencyFund === 'true';
			targetDate = form.data.targetDate || '';
		}
	});

	// Initialize checkbox states from goal data or form data
	$effect(() => {
		if (goal) {
			// Edit mode: parse existing filters
			try {
				const parsedAccountTypes = JSON.parse(goal.accountTypeFilters) as string[];
				const parsedLiquidity = JSON.parse(goal.liquidityFilters) as string[];
				accountTypeFilters = new Map(parsedAccountTypes.map((t) => [t, true]));
				liquidityFilters = new Map(parsedLiquidity.map((l) => [l, true]));
			} catch (e) {
				console.error('Failed to parse filter data', e);
				accountTypeFilters = new Map();
				liquidityFilters = new Map();
			}
		} else if (form?.data?.accountTypeFilters && form?.data?.liquidityFilters) {
			// Restore from failed submission
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

	// Validation rules
	const nameRules = [
		required(),
		minLength(3)
	];

	const targetAmountRules = [
		required(),
		monetary()
	];

	// Simple validation functions - return error value without mutation
	function validateName(): string {
		if (name.trim().length < 3) {
			return 'Goal name must be at least 3 characters';
		}
		return '';
	}

	function validateTargetAmount(): string {
		const trimmed = targetAmount.trim();
		if (!trimmed) {
			return 'Target amount is required';
		}
		// Monetary format validation
		const match = trimmed.match(/^(\d+)\.?(\d{0,2})?$/);
		if (!match) {
			return 'Invalid amount format. Enter amount like 1000.00 or 1000';
		}
		return '';
	}

	// Form is valid when all required fields are valid
	const isFormValid = $derived(validateName() && validateTargetAmount());

	// Check if at least one account type is selected
	const hasAccountTypeFilter = $derived(
		Array.from(accountTypeFilters.values()).some((v) => v === true)
	);

	// Check if at least one liquidity is selected
	const hasLiquidityFilter = $derived(
		Array.from(liquidityFilters.values()).some((v) => v === true)
	);

	// Toggle account type filter - returns new Map without mutation
	function toggleAccountType(value: string) {
		const newMap = new Map(accountTypeFilters);
		newMap.set(value, !newMap.get(value));
		return newMap;
	}

	// Toggle liquidity filter - returns new Map without mutation
	function toggleLiquidity(value: string) {
		const newMap = new Map(liquidityFilters);
		newMap.set(value, !newMap.get(value));
		return newMap;
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
</script>

<form
	method="POST"
	action={formAction}
	use:enhance={() => {
		return async ({ update }) => {
			await update();
		};
	}}
	class="border-b border-black p-2"
>
	<!-- Hidden slug field for edit mode -->
	{#if goal?.slug}
		<input type="hidden" name="slug" value={goal.slug} />
	{/if}

	<!-- Goal Name -->
	<div class="mb-1">
		<label for="name" class="font-bold text-xs block mb-1">Goal Name *</label>
		<input
			type="text"
			id="name"
			name="name"
			bind:value={name}
			placeholder="e.g., House Deposit"
			class="w-full max-w-md border border-black px-2 py-1 text-sm focus:outline-none font-terminal"
			required
		/>
		{#if nameError}
			<small class="text-red-700 font-bold text-xs block">{nameError}</small>
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
			class="w-full max-w-md border border-black px-2 py-1 text-sm focus:outline-none font-terminal"
			required
		/>
		{#if targetAmountError}
			<small class="text-red-700 font-bold text-xs block">{targetAmountError}</small>
		{/if}
	</div>

	<!-- Emergency Fund Toggle -->
	<div class="mb-1">
		<label class="flex items-center gap-1 text-xs cursor-pointer">
			<input
				type="checkbox"
				name="isEmergencyFund"
				checked={isEmergencyFund}
				onchange={() => { isEmergencyFund = !isEmergencyFund; }}
				class="cursor-pointer"
			/>
			<span class="font-bold">Enable Emergency Fund Milestones</span>
		</label>
		<small class="text-gray-600 text-xs block ml-5">Shows 1mo, 3mo, 6mo, 12mo milestone markers</small>
	</div>

	<!-- Target Date -->
	<div class="mb-1">
		<label for="targetDate" class="font-bold text-xs block mb-1">Target Date (optional)</label>
		<input
			type="date"
			id="targetDate"
			name="targetDate"
			bind:value={targetDate}
			class="w-full max-w-md border border-black px-2 py-1 text-sm focus:outline-none font-terminal"
		/>
		{#if targetDateError}
			<small class="text-red-700 font-bold text-xs block">{targetDateError}</small>
		{/if}
	</div>

	<!-- Account Type Filters (Multi-select) -->
	<div class="mb-1 border border-black p-2">
		<span class="font-bold text-xs block mb-1">Account Type Filters</span>
		<div class="grid grid-cols-3 gap-1">
			{#each accountTypeOptions as option}
				<label class="flex items-center gap-1 text-xs cursor-pointer">
					<input
						type="checkbox"
						name="account_type_checkbox_{option.value}"
						checked={accountTypeFilters.get(option.value) || false}
						onchange={() => toggleAccountType(option.value)}
						class="cursor-pointer"
					/>
					<span>{option.label}</span>
				</label>
			{/each}
		</div>
		<!-- Hidden input for form submission -->
		<input type="hidden" name="account_type_filters" value={JSON.stringify(selectedAccountTypes)} />
		{#if accountTypeFiltersError}
			<small class="text-red-700 font-bold text-xs block">{accountTypeFiltersError}</small>
		{/if}
	</div>

	<!-- Liquidity Filters (Multi-select) -->
	<div class="mb-1 border border-black p-2">
		<span class="font-bold text-xs block mb-1">Liquidity Filters</span>
		<div class="grid grid-cols-3 gap-1">
			{#each liquidityOptions as option}
				<label class="flex items-center gap-1 text-xs cursor-pointer">
					<input
						type="checkbox"
						name="liquidity_checkbox_{option.value}"
						checked={liquidityFilters.get(option.value) || false}
						onchange={() => toggleLiquidity(option.value)}
						class="cursor-pointer"
					/>
					<span>{option.label}</span>
				</label>
			{/each}
		</div>
		<!-- Hidden input for form submission -->
		<input type="hidden" name="liquidity_filters" value={JSON.stringify(selectedLiquidity)} />
		{#if liquidityFiltersError}
			<small class="text-red-700 font-bold text-xs block">{liquidityFiltersError}</small>
		{/if}
	</div>

	<!-- Error Display -->
	{#if form?.error}
		<p class="text-red-700 font-bold my-2">{form.error}</p>
	{/if}

	<!-- Submit Button -->
	<div class="flex gap-2 mt-4">
		<button
			type="submit"
			class="bracket-link"
			disabled={!isFormValid || !hasAccountTypeFilter || !hasLiquidityFilter}
		>
			[{submitLabel}]
		</button>
	</div>
</form>
