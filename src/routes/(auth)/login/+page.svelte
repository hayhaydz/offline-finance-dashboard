<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormField } from '$lib/components/ui/index';
	import { required, totpOrBackupCode } from '$lib/validation/rules';

	interface ActionData {
		error?: string;
		locked?: boolean;
		delay?: number;
	}

	let { form, data }: { form: ActionData; data: any } = $props();

	let showDelayMessage = $state(false);
	let delayCountdown = $state(0);

	$effect(() => {
		// Handle rate limit delay countdown
		if (form?.delay) {
			showDelayMessage = true;
			delayCountdown = Math.ceil(form.delay / 1000);
			const interval = setInterval(() => {
				delayCountdown--;
				if (delayCountdown <= 0) {
					clearInterval(interval);
					showDelayMessage = false;
				}
			}, 1000);
			return () => clearInterval(interval);
		}
	});

	// Form field values
	let username = $state('');
	let password = $state('');
	let totpCode = $state('');

	// Validation rules for each field
	const usernameRules = [required()];
	const passwordRules = [required()];
	const totpCodeRules = [
		required(),
		totpOrBackupCode()
	];

	// Form validation state
	let usernameValid = $state(false);
	let passwordValid = $state(false);
	let totpCodeValid = $state(false);

	// Form is valid when all fields are valid
	const isFormValid = $derived(
		usernameValid && passwordValid && totpCodeValid
	);

	// Component refs for validation access (must be $state for $effect tracking)
	let usernameField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let passwordField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let totpCodeField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();

	// Update validation state when fields change
	$effect(() => {
		usernameValid = usernameField?.isValid ?? false;
		passwordValid = passwordField?.isValid ?? false;
		totpCodeValid = totpCodeField?.isValid ?? false;
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">LOG IN</h1>
	<p class="text-gray-600 my-1">Enter your credentials and authentication code</p>
</div>

{#if data?.autoLoginEnabled}
	<div class="border border-amber-700 border-l-4 p-2 mb-2">
		<span class="text-amber-700 font-bold">Development Auto-Login Enabled - Redirecting...</span>
	</div>
{/if}

	{#if form?.locked}
		<div class="bg-red-50 border border-red-600 p-4 mb-4">
			<h2 class="mt-0 text-red-600 text-lg">Account Locked</h2>
			<p class="mb-0">
				Too many failed login attempts. Your account has been locked for 15 minutes.
				Please try again later.
			</p>
		</div>
	{:else}
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
				disabled={showDelayMessage}
			/>

			<FormField
				bind:this={passwordField}
				label="Password"
				name="password"
				type="password"
				bind:value={password}
				rules={passwordRules}
				placeholder="Enter password"
				autocomplete="current-password"
				disabled={showDelayMessage}
			/>

			<FormField
				bind:this={totpCodeField}
				label="Authentication Code"
				name="totpCode"
				type="text"
				bind:value={totpCode}
				rules={totpCodeRules}
				placeholder="123456 or ABC12345"
				autocomplete="one-time-code"
				disabled={showDelayMessage}
			/>
			<small class="block text-gray-600 text-xs mb-2">Enter your 6-digit authenticator code OR 8-character backup code</small>

			{#if showDelayMessage}
				<div class="border border-amber-700 border-l-4 p-2 mb-2">
					<span class="text-amber-700">Too many failed attempts. Please wait {delayCountdown} seconds before trying again.</span>
				</div>
			{/if}

			{#if form?.error}
				<p class="text-red-700 font-bold my-2">{form.error}</p>
			{/if}

			<div class="mb-2">
				<button
					type="submit"
					disabled={!isFormValid || showDelayMessage}
					class="bracket-link"
				>
					Log In
				</button>
			</div>
		</form>
	{/if}

	<div class="border-b border-black p-2">
		Don't have an account? <a href="/register" class="bracket-link">Register</a>
	</div>
