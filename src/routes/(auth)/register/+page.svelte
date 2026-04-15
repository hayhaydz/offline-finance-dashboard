<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormField } from '$lib/components/ui/index';
	import {
		required,
		minLength,
		maxLength,
		pattern,
		matches,
		strongPassword
	} from '$lib/validation/rules';

	let { form } = $props();

	// Form field values
	let username = $state('');
	let password = $state('');
	let confirmPassword = $state('');

	// Form data for cross-field validation
	const formData = $derived({
		username,
		password,
		confirmPassword
	});

	// Validation rules for each field
	const usernameRules = [
		required(),
		minLength(3),
		maxLength(50),
		pattern(/^[a-zA-Z0-9_-]+$/, 'Username must contain only letters, numbers, underscore, and hyphen')
	];

	const passwordRules = strongPassword(12);

	const confirmPasswordRules = [
		...passwordRules,
		matches('password', 'Passwords must match')
	];

	// Form validation state
	let usernameValid = $state(false);
	let passwordValid = $state(false);
	let confirmPasswordValid = $state(false);

	// Form is valid when all fields are valid
	const isFormValid = $derived(
		usernameValid && passwordValid && confirmPasswordValid
	);

	// Component refs for validation access (must be $state for $effect tracking)
	let usernameField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let passwordField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let confirmPasswordField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();

	// Update validation state when fields change
	$effect(() => {
		usernameValid = usernameField?.isValid ?? false;
		passwordValid = passwordField?.isValid ?? false;
		confirmPasswordValid = confirmPasswordField?.isValid ?? false;
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">CREATE ACCOUNT</h1>
	<p class="text-gray-600 my-1">Register with username and password</p>
</div>

<form method="POST" use:enhance class="border-b border-black p-2">
	<FormField
		bind:this={usernameField}
		label="Username"
		name="username"
		type="text"
		bind:value={username}
		rules={usernameRules}
		placeholder="Enter username"
		autocomplete="username"
		formData={formData}
	/>

	<FormField
		bind:this={passwordField}
		label="Password"
		name="password"
		type="password"
		bind:value={password}
		rules={passwordRules}
		placeholder="Enter password"
		autocomplete="new-password"
	/>

	<FormField
		bind:this={confirmPasswordField}
		label="Confirm Password"
		name="confirmPassword"
		type="password"
		bind:value={confirmPassword}
		rules={confirmPasswordRules}
		placeholder="Re-enter password"
		autocomplete="new-password"
		formData={formData}
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
			Continue to MFA Setup
		</button>
	</div>
</form>

<div class="border-b border-black p-2">
	Already have an account? <a href="/login" class="bracket-link">Log in</a>
</div>
