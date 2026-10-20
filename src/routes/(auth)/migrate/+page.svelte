<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormField } from '$lib/components/ui/index';
	import { required } from '$lib/validation/rules';

	interface MigrateResult {
		success?: boolean;
		tables?: Array<{ table: string; rowsScanned: number; rowsEncrypted: number }>;
		error?: string;
	}

	let { form, data }: { form: MigrateResult | null; data: any } = $props();

	let password = $state('');
	const passwordRules = [required()];
	let passwordField = $state<{ isValid: boolean } | undefined>();
	let passwordValid = $state(false);
	$effect(() => {
		passwordValid = passwordField?.isValid ?? false;
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">DATA ENVELOPE MIGRATION</h1>
	<p class="text-gray-600 my-1">
		Your data is moving to per-user envelope encryption: a new random data key
		will wrap your data and only your password will unseal it. This runs once.
	</p>
</div>

{#if form?.success}
	<div class="border border-green-700 border-l-4 p-2 mb-4 bg-green-50">
		<span class="text-green-700 font-bold">Migration complete. Data re-sealed under your envelope.</span>
		{#if form.tables?.length}
			<ul class="my-1 pl-4 list-disc text-xs">
				{#each form.tables as t}
					<li>{t.table}: {t.rowsEncrypted}/{t.rowsScanned} value(s) encrypted</li>
				{/each}
			</ul>
		{/if}
		<p class="my-1 font-bold">One step left: your recovery passphrase (required).</p>
		<div class="mt-2">
			<a href="/recovery-enroll?mode=migrate" class="bracket-link">Continue to recovery enrollment</a>
		</div>
	</div>
{:else}
	<form method="POST" use:enhance class="border-b border-black p-2">
		<p class="text-gray-600 my-1 text-xs">
			Confirm your password to generate the envelope. Nothing changes on disk
			that could unseal your data without it.
		</p>
		<FormField
			bind:this={passwordField}
			label="Password (confirm)"
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

		<div class="mb-2 mt-2">
			<button type="submit" disabled={!passwordValid} class="bracket-link">
				Migrate to envelope
			</button>
		</div>
	</form>
{/if}
