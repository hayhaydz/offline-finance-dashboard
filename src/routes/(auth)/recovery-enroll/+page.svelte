<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormField } from '$lib/components/ui/index';
	import { required } from '$lib/validation/rules';

	interface EnrollResult {
		success?: boolean;
		passphrase?: string;
		error?: string;
	}
	interface PasswordResult {
		error?: string;
	}

	let { form, data }: { form: EnrollResult & PasswordResult | null; data: any } = $props();

	// The three wallet consequences (spec recovery-credentials) — must be
	// visible alongside the passphrase with explicit acknowledgement.
	const consequences = [
		'Forget your password AND lose this paper: your data is permanently unrecoverable. No reset exists.',
		'This passphrase ALONE can unlock your data (break-glass single factor).',
		'If this passphrase is compromised, full data-key rotation is required (re-encrypts everything).'
	];

	let acknowledged = $state(false);
	let confirmed = $state(false);

	// Recovery-mode password form state
	interface FormFieldRef {
		isValid: boolean;
	}
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	const passwordRules = [required()];
	let currentField = $state<FormFieldRef | undefined>();
	let newField = $state<FormFieldRef | undefined>();
	let confirmField = $state<FormFieldRef | undefined>();
	let currentValid = $state(false);
	let newValid = $state(false);
	let confirmValid = $state(false);
	$effect(() => { currentValid = currentField?.isValid ?? false; });
	$effect(() => { newValid = newField?.isValid ?? false; });
	$effect(() => { confirmValid = confirmField?.isValid ?? false; });

	const isRecoveryMode = $derived(data?.mode === 'recovery');
</script>

{#if isRecoveryMode}
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-2 mt-0">RECOVERY UNLOCK — NEW PASSWORD</h1>
		<p class="text-gray-600 my-1">
			You unlocked with the paper passphrase. Set a new password before the app
			becomes usable. Your data is untouched — only the password slot is re-wrapped.
		</p>
	</div>

	<form method="POST" action="?/setNewPassword" class="border-b border-black p-2">
		<FormField
			bind:this={currentField}
			label="Previous password OR recovery passphrase"
			name="currentPassword"
			type="password"
			bind:value={currentPassword}
			rules={passwordRules}
			placeholder="Previous credential"
			autocomplete="current-password"
		/>
		<FormField
			bind:this={newField}
			label="New password"
			name="newPassword"
			type="password"
			bind:value={newPassword}
			rules={passwordRules}
			placeholder="Minimum 12 characters"
			autocomplete="new-password"
		/>
		<FormField
			bind:this={confirmField}
			label="Confirm new password"
			name="confirmPassword"
			type="password"
			bind:value={confirmPassword}
			rules={passwordRules}
			placeholder="Repeat new password"
			autocomplete="new-password"
		/>

		{#if form?.error}
			<p class="text-red-700 font-bold my-2">{form.error}</p>
		{/if}

		<div class="mb-2 mt-2">
			<button
				type="submit"
				disabled={!currentValid || !newValid || !confirmValid}
				class="bracket-link"
			>
				Set new password
			</button>
		</div>
	</form>
{:else if data?.passphrase}
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-2 mt-0">RECOVERY PASSPHRASE — WRITE IT DOWN NOW</h1>
		<p class="text-red-700 font-bold my-1">
			Shown exactly once. The server cannot display it again.
		</p>
	</div>

	<div class="border-2 border-black p-3 my-2 bg-white font-mono text-lg tracking-wide break-words">
		{data.passphrase}
	</div>

	<div class="border border-red-700 border-l-4 p-2 mb-2 bg-red-50">
		<h2 class="mt-0 font-bold text-red-700">WALLET SEMANTICS — READ BEFORE CONTINUING</h2>
		<ul class="my-1 pl-4 list-disc">
			{#each consequences as consequence}
				<li class="mb-1">{consequence}</li>
			{/each}
		</ul>
	</div>

	<form method="POST" action="?/done" class="border-b border-black p-2">
		<label class="flex items-start gap-2 my-2 cursor-pointer">
			<input type="checkbox" bind:checked={confirmed} class="mt-1" />
			<span class="text-sm">
				I have written the passphrase on paper and stored it offline. I understand
				the three consequences above.
			</span>
		</label>
		<div class="mb-2">
			<button type="submit" disabled={!confirmed} class="bracket-link">
				I have stored it — continue
			</button>
		</div>
	</form>
{:else}
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-2 mt-0">RECOVERY PASSPHRASE (REQUIRED)</h1>
		<p class="text-gray-600 my-1">
			Your data key is sealed by your password. This generated 12-word paper
			passphrase is the only break-glass copy — enrollment is mandatory.
		</p>
	</div>

	<div class="border border-amber-700 border-l-4 p-2 mb-2 bg-amber-50">
		<h2 class="mt-0 font-bold text-amber-700">BEFORE YOU GENERATE — WALLET SEMANTICS</h2>
		<ul class="my-1 pl-4 list-disc">
			{#each consequences as consequence}
				<li class="mb-1">{consequence}</li>
			{/each}
		</ul>
	</div>

	<form method="POST" action="?/enroll" class="border-b border-black p-2">
		<label class="flex items-start gap-2 my-2 cursor-pointer">
			<input type="checkbox" bind:checked={acknowledged} class="mt-1" />
			<span class="text-sm">
				I understand the three consequences and want to generate a recovery
				passphrase now.
			</span>
		</label>

		{#if form?.error}
			<p class="text-red-700 font-bold my-2">{form.error}</p>
		{/if}

		<div class="mb-2">
			<button type="submit" disabled={!acknowledged} class="bracket-link">
				Generate recovery passphrase
			</button>
		</div>
	</form>
{/if}
