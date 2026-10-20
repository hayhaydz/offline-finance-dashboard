<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { startAuthentication } from '@simplewebauthn/browser';
	import { FormField } from '$lib/components/ui/index';
	import { required } from '$lib/validation/rules';
	import { devLogClient } from '$lib/utils/client-logger';

	// [PRF-DIAG] investigation logging (task 6.4). Dev-only via devLogClient;
	// logs lengths, never the PRF output bytes.
	function prfDiag(stage: string, data: unknown) {
		devLogClient('prf-diag', `[PRF-DIAG] ${stage}`, data);
	}

	interface ActionData {
		error?: string;
		locked?: boolean;
		delay?: number;
		deviceRequired?: boolean;
	}

	interface FormFieldRef {
		isValid: boolean;
	}

	let { form, data }: { form: ActionData | null; data: any } = $props();

	const reason = $derived(page.url.searchParams.get('reason'));
	const mode = $derived(page.url.searchParams.get('mode') ?? 'password');

	let password = $state('');
	let passphrase = $state('');
	let showRecovery = $derived(mode === 'recovery');

	// Validation
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

	// ─── L2 device step ────────────────────────────────────────────────────
	// The browser runs the WebAuthn get() locally (UV required); the signed
	// assertion + PRF output travel with the password in ONE POST so the
	// server can verify both factors unwrap the SAME DataKey (2-of-2).
	let deviceToken = $state('');
	let deviceAssertion = $state('');
	let devicePrf = $state('');
	let deviceReady = $state(false);
	let deviceBusy = $state(false);
	let deviceError = $state('');

	function b64(buf: ArrayBuffer): string {
		const bytes = new Uint8Array(buf);
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		return btoa(bin);
	}

	function b64ToBytes(b64: string): Uint8Array {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	}

	async function runDeviceStep() {
		deviceBusy = true;
		deviceError = '';
		deviceReady = false;
		try {
			const res = await fetch('/unlock/device-options', { method: 'POST' });
			const payload = await res.json();
			prfDiag('device-options response', {
				ok: res.ok,
				hasToken: !!payload.token,
				saltB64Length: payload.salt?.length,
				allowCredentials: payload.options?.allowCredentials?.length ?? 0,
				userVerification: payload.options?.userVerification
			});
			if (!res.ok) throw new Error(payload.error ?? 'Device step failed');

			// Inject the prf extension client-side (BufferSource cannot cross
			// JSON): same per-user salt the slot was wrapped with.
			const saltBytes = b64ToBytes(payload.salt);
			(payload.options as any).extensions = {
				prf: { eval: { first: saltBytes } }
			};
			prfDiag('extension injected', {
				saltByteLength: saltBytes.byteLength,
				isUint8Array: saltBytes instanceof Uint8Array
			});

			const assertion = await startAuthentication({
				optionsJSON: payload.options
			});
			const clientExt = (assertion as any).clientExtensionResults ?? {};
			const prfFirst = clientExt.prf?.results?.first;
			prfDiag('assertion result', {
				credentialId: assertion.id,
				authenticatorAttachment: (assertion as any).authenticatorAttachment,
				clientExtensionKeys: Object.keys(clientExt),
				prf: clientExt.prf
					? {
							hasResults: !!clientExt.prf.results,
							firstByteLength: clientExt.prf.results?.first?.byteLength ?? null
						}
					: '(no prf key in clientExtensionResults)'
			});
			if (!prfFirst) {
				throw new Error('Device did not return a PRF output — rerun the step');
			}

			deviceToken = payload.token;
			deviceAssertion = JSON.stringify(assertion);
			devicePrf = b64(prfFirst);
			deviceReady = true;
		} catch (err) {
			deviceError = err instanceof Error ? err.message : String(err);
			prfDiag('device step failed', { message: deviceError });
		} finally {
			deviceBusy = false;
		}
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">UNLOCK</h1>
	<p class="text-gray-600 my-1">
		Data is sealed. Enter your password{data?.deviceEnrolled ? ' and complete the device step' : ''} to
		unseal it in memory — the key never touches disk.
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
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="border-b border-black p-2"
	>
		{#if data?.deviceEnrolled}
			<div class="border border-black p-2 mb-2">
				<p class="text-xs text-gray-600 my-1">
					Device slot enrolled — 2-of-2: password + device (screen lock / UV) both required.
				</p>
				<input type="hidden" name="deviceToken" value={deviceToken} />
				<input type="hidden" name="deviceAssertion" value={deviceAssertion} />
				<input type="hidden" name="devicePrf" value={devicePrf} />
				<div class="flex items-center gap-3">
					<button
						type="button"
						class="bracket-link"
						disabled={deviceBusy}
						onclick={runDeviceStep}
					>
						{deviceBusy ? 'Waiting for device…' : deviceReady ? 'Redo device step' : 'Run device step'}
					</button>
					{#if deviceReady}
						<span class="text-green-700 font-bold text-xs">[ DEVICE READY ]</span>
					{/if}
				</div>
				{#if deviceError}
					<p class="text-red-700 text-xs font-bold my-1">{deviceError}</p>
				{/if}
			</div>
		{/if}

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
				disabled={!passwordValid || submitting || (data?.deviceEnrolled && !deviceReady)}
				class="bracket-link"
			>
				Unlock
			</button>
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
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
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
