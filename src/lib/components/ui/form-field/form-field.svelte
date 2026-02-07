<script lang="ts">
	import type { ValidationRule } from '$lib/validation/types';
	import { cn } from '$lib/utils';

	interface Props {
		/** Field label displayed above input */
		label: string;
		/** Input name attribute (for form submission) */
		name: string;
		/** Input type */
		type?: 'text' | 'email' | 'password' | 'number';
		/** Bound value (two-way binding) */
		value: string;
		/** Array of validation rules to apply */
		rules: ValidationRule[];
		/** Placeholder text */
		placeholder?: string;
		/** Autocomplete attribute */
		autocomplete?: string;
		/** Input mode for mobile keyboards */
		inputmode?: 'numeric' | 'text' | 'email';
		/** Disabled state */
		disabled?: boolean;
		/** Optional filter function to transform input (e.g., numeric-only) */
		filter?: (value: string) => string;
		/** Optional form data for cross-field validation */
		formData?: Record<string, string>;
		/** Additional CSS classes for container */
		class?: string;
	}

	let {
		label,
		name,
		type = 'text',
		value = $bindable(),
		rules,
		placeholder = '',
		autocomplete = '',
		inputmode,
		disabled = false,
		filter,
		formData,
		class: className = ''
	}: Props = $props();

	// Internal state
	let touched = $state(false);
	let dirty = $state(false);  // User has actually typed something
	let error = $state<string | null>(null);

	// Validate current value against all rules
	function validate(): boolean {
		for (const rule of rules) {
			if (!rule.validate(value, formData)) {
				error = rule.message;
				return false;
			}
		}
		error = null;
		return true;
	}

	// Computed validation state
	const isValid = $derived(!error);

	// Handle blur event
	function handleBlur() {
		touched = true;
		validate();
	}

	// Handle input event
	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		let newValue = target.value;

		// Apply filter if provided
		if (filter) {
			newValue = filter(newValue);
		}

		value = newValue;
		dirty = true;  // Mark as dirty when user types

		// Validate on change if already touched
		if (touched) {
			validate();
		}
	}

	// Touch function to manually mark field as touched
	function touch() {
		touched = true;
		validate();
	}

	// Expose validation state for parent component access
	export { isValid, validate, error, touch };
</script>

<div class={cn('mb-1', className)}>
	<label for={name} class="font-bold text-xs block mb-1">{label}</label>
	<input
		{type}
		{name}
		{placeholder}
		autocomplete={autocomplete ? (autocomplete as any) : undefined}
		{inputmode}
		{disabled}
		{value}
		onblur={handleBlur}
		oninput={handleInput}
		class="border border-black p-1 w-full font-terminal text-sm focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
	/>
	{#if touched && dirty && error}
		<small class="text-red-700 font-bold text-xs block">{error}</small>
	{/if}
</div>
