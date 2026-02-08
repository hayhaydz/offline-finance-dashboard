<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/ui/form-field/form-field.svelte';
	import { required, exactLength } from '$lib/validation/rules';

	let { form, data } = $props();

	// QR code data URL from load function (reactive)
	const qrCodeUrl = $derived(data?.qrCodeUrl);
	const username = $derived(data?.username);
	
	// Backup codes are returned from the action after success
	const backupCodes = $derived(form?.backupCodes);
	const isSuccess = $derived(form?.success);

	// Form field value
	let totpCode = $state('');

	// Validation rules for TOTP code
	const totpCodeRules = [
		required(),
		exactLength(6, 'Enter a valid 6-digit code')
	];

	// Numeric-only filter for TOTP code
	function filterNumeric(value: string): string {
		return value.replace(/[^\d]/g, '').slice(0, 6);
	}

	// Form validation state
	let totpCodeValid = $state(false);

	// Form is valid when code is valid
	const isFormValid = $derived(totpCodeValid);

	// Component ref for validation access (must be $state for $effect tracking)
	let totpCodeField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();

	// Update validation state when field changes
	$effect(() => {
		totpCodeValid = totpCodeField?.isValid ?? false;
	});
</script>

{#if !isSuccess}
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-2 mt-0">SET UP TWO-FACTOR AUTHENTICATION</h1>
		<p class="text-gray-600 my-1">
			Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
		</p>
	</div>

	{#if qrCodeUrl}
		<div class="border-b border-black p-2 text-center">
			<img src={qrCodeUrl} alt="QR Code for TOTP Setup" class="max-w-[200px] mx-auto" />
			<p class="mt-2 font-bold">{username}</p>
		</div>
	{/if}

	<form method="POST" use:enhance class="border-b border-black p-2">
		<FormField
			bind:this={totpCodeField}
			label="Enter Authentication Code"
			name="totpCode"
			type="text"
			bind:value={totpCode}
			rules={totpCodeRules}
			placeholder="123456"
			autocomplete="one-time-code"
			inputmode="numeric"
			filter={filterNumeric}
		/>
		<small class="block text-gray-600 text-xs mb-2"
			>Enter the 6-digit code from your authenticator app</small
		>

		{#if form?.error}
			<p class="text-red-700 font-bold my-2">{form.error}</p>
		{/if}

		<div class="mb-2">
			<button type="submit" disabled={!isFormValid} class="bracket-link">
				Verify and Complete Registration
			</button>
		</div>
	</form>

	<div class="border-b border-black p-2">
		<p class="text-gray-600 text-xs my-1">
			Can't scan the QR code? Your manual entry key is shown in the authenticator app setup.
		</p>
	</div>
{:else}
	<div class="border-b border-black p-2 bg-green-50">
		<h1 class="text-lg font-bold mb-2 mt-0 text-green-800">MFA SETUP SUCCESSFUL</h1>
		<p class="text-green-700 my-1">
			Two-factor authentication has been enabled for your account.
		</p>
	</div>

	{#if backupCodes}
		<div class="border-b border-black p-2">
			<div class="font-bold mb-1">SAVE YOUR BACKUP CODES</div>
			<p class="text-gray-600 text-xs my-1">
				Store these codes securely. You can use them to access your account if you lose access to
				your authenticator device.
			</p>
			<ul class="grid grid-cols-2 gap-1 list-none p-0 my-2 font-mono text-sm">
				{#each backupCodes as code}
					<li class="p-1 bg-white border border-black text-center">{code}</li>
				{/each}
			</ul>
			<p class="text-amber-700 text-xs my-1 font-bold">These codes will not be shown again.</p>
		</div>
	{/if}

	<div class="p-4 text-center border-b border-black">
		<a href="/accounts" class="bracket-link text-lg">Continue to Dashboard</a>
	</div>
{/if}
