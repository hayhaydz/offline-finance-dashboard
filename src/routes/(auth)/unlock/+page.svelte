<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { FormField } from '$lib/components/ui/index';
	import { required } from '$lib/validation/rules';

	interface ActionData {
		error?: string;
		locked?: boolean;
		delay?: number;
	}

	let { form, data }: { form: ActionData | null; data: any } = $props();

	const reason = $derived(page.url.searchParams.get('reason'));
	const mode = $derived(page.url.searchParams.get('mode') ?? 'password');

	let password = $state('');
	let passphrase = $state('');
	let showRecovery = $derived(mode === 'recovery');

	// Validation
	interface FormFieldRef {
		isValid: boolean;
	}
	const passwordRules = [required()];
	const passphraseRules = [required()];
	let passwordField = $state<FormFieldRef | undefined>();
	let passphraseField = $state<FormFieldRef | undefined>();
	let passwordValid = $state(false);
	let passphraseValid = $state(false);

	$effect(() => {
		passwordValid = passwordField?.isValid ?? false;
	});
	$effect(() => {
		passphraseValid = passphraseField?.isValid ?? false;
	});

	let submitting = $state(false);
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">UNLOCK</h1>
	<p class="text-gray-600 my-1">
		Data is sealed. Enter your password to unseal it in memory — the key never
		touches disk.
	</p>
</div>

{#if reason === 'sealed' || reason === 'restart'}
	<div class="border border-amber-700 border-l-4 p-2 mb-4 bg-amber-50">
		<span class="text-amber-700 font-bold">
			Data sealed{reason === 'restart' ? ' — server restarted' : ''}. Unlock to
			continue where you left off.
		</span>
	</div>
{/if}

{#if form?.locked}
	<div class="bg-red-50 border border-red-600 p-4 mb-4">
		<h2 class="mt-0 text-red-600 text-lg">Account Locked</h2>
		<p class="mb-0">
			Too many failed attempts. Your account has been locked for 15 minutes.
		</p>
	</div>
{:else if !showRecovery}
	<form
		method="POST"
		action="?/password"
		use:enhance={() => { submitting = true; return async () => { submitting = false; }; }}
		class="border-b border-black p-2"
	>
		<FormField
			bind:this={passwordField}
			label="Password"
			name="password"
			type="password"
			bind:value={password}
			rules={passwordRules}
			placeholder="Enter password"
			autocomplete="current-password"
		/>

		{#if form?.error}
			<p class="text-red-700 font-bold my-2">{form.error}</p>
		{/if}

		<div class="mb-2 mt-2 flex items-center gap-4">
			<button
				type="submit"
				disabled={!passwordValid || submitting}
				class="bracket-link"
			>
				Unlock
			</button>
			{#if data?.deviceEnrolled}
				<span class="text-xs text-gray-600">[ DEVICE STEP: L2 ]</span>
			{/if}
		</div>
	</form>

	{#if data?.hasRecovery}
		<div class="border-b border-black p-2">
			Lost your password? <a href="?mode=recovery" class="bracket-link">Use recovery passphrase</a>
			<span class="text-gray-600 text-xs block mt-1">
				Paper break-glass slot — unlocks alone and forces credential re-enrollment.
			</span>
		</div>
	{/if}
{:else}
	<form
		method="POST"
		action="?/recovery"
		use:enhance={() => { submitting = true; return async () => { submitting = false; }; }}
		class="border-b border-black p-2"
	>
		<p class="text-gray-600 my-1 text-xs">
			Recovery unlock is single-factor (wallet semantics): it works, but you
			must set a new password before using the app.
		</p>
		<FormField
			bind:this={passphraseField}
			label="Recovery Passphrase (12 words)"
			name="passphrase"
			type="text"
			bind:value={passphrase}
			rules={passphraseRules}
			placeholder="word word word word word word word word word word word word"
			autocomplete="off"
		/>

		{#if form?.error}
			<p class="text-red-700 font-bold my-2">{form.error}</p>
		{/if}

		<div class="mb-2 mt-2 flex items-center gap-4">
			<button
				type="submit"
				disabled={!passphraseValid || submitting}
				class="bracket-link"
			>
				Unlock with paper
			</button>
			<a href="?mode=password" class="bracket-link">Back to password</a>
		</div>
	</form>
{/if}
