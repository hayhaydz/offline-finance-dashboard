<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { FormField } from '$lib/components/ui/index';
	import { required } from '$lib/validation/rules';
	import { devLogClient } from '$lib/utils/client-logger';

	// [PRF-DIAG] investigation logging (task 6.4). Dev-only via devLogClient.
	// Never logs the PRF output bytes themselves — lengths only.
	function prfDiag(stage: string, data: unknown) {
		devLogClient('prf-diag', `[PRF-DIAG] ${stage}`, data);
	}

	interface SlotView {
		slotId: string;
		kind: string;
		label: string;
		createdAt: string;
	}

	interface ActionData {
		error?: string;
		success?: boolean;
		message?: string;
		recoveryPassphrase?: string;
		deviceSlotsRevoked?: boolean;
		inactivityTimeout?: number;
	}

	let { form, data }: { form: ActionData | null; data: any } = $props();

	const kindLabels: Record<string, string> = {
		password: 'PASSWORD SLOT',
		'webauthn-prf': 'DEVICE SLOT',
		'recovery-passphrase': 'RECOVERY PAPER SLOT'
	};
	const kindDescriptions: Record<string, string> = {
		password: 'Unlocks via your password (wrap slot 1).',
		'webauthn-prf': 'Unlocks via your device (wrap slot 2) — 2-of-2 with the password.',
		'recovery-passphrase': 'Break-glass single-factor paper copy.'
	};

	// Password change form
	interface FormFieldRef {
		isValid: boolean;
	}
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	const pwRules = [required()];
	let currentField = $state<FormFieldRef | undefined>();
	let newField = $state<FormFieldRef | undefined>();
	let confirmField = $state<FormFieldRef | undefined>();
	let currentValid = $state(false);
	let newValid = $state(false);
	let confirmValid = $state(false);
	$effect(() => { currentValid = currentField?.isValid ?? false; });
	$effect(() => { newValid = newField?.isValid ?? false; });
	$effect(() => { confirmValid = confirmField?.isValid ?? false; });

	// DataKey rotation confirmation
	let rotationPassword = $state('');
	let rotationField = $state<FormFieldRef | undefined>();
	let rotationValid = $state(false);
	$effect(() => { rotationValid = rotationField?.isValid ?? false; });

	// L2 device enrollment (WebAuthn PRF ceremony, client-driven)
	let deviceBusy = $state(false);
	let deviceError = $state('');
	let deviceDone = $state(false);

	function b64(buf: ArrayBuffer): string {
		const bytes = new Uint8Array(buf);
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		return btoa(bin);
	}

	function b64ToBytes(value: string): Uint8Array {
		const bin = atob(value);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	}

	async function runDeviceEnrollment() {
		deviceBusy = true;
		deviceError = '';
		deviceDone = false;
		try {
			const startRes = await fetch('/settings/security/device/start', { method: 'POST' });
			const start = await startRes.json();
			prfDiag('start response', {
				ok: startRes.ok,
				hasToken: !!start.token,
				saltB64Length: start.salt?.length,
				optionsExtensions: start.options?.extensions ?? '(none — expected, injected next)',
				optionsUserVerification: start.options?.authenticatorSelection?.userVerification,
				optionsAttachment: start.options?.authenticatorSelection?.authenticatorAttachment,
				rp: start.options?.rp
			});
			if (!startRes.ok) throw new Error(start.error ?? 'Enrollment failed to start');

			// Inject the prf extension client-side (BufferSource cannot cross JSON)
			const saltBytes = b64ToBytes(start.salt);
			(start.options as any).extensions = {
				prf: { eval: { first: saltBytes } }
			};
			prfDiag('extension injected', {
				saltByteLength: saltBytes.byteLength,
				isUint8Array: saltBytes instanceof Uint8Array
			});

		const { startRegistration, startAuthentication } = await import('@simplewebauthn/browser');
		const registration = await startRegistration({ optionsJSON: start.options });

		const clientExt = (registration as any).clientExtensionResults ?? {};
		const prfFirst = clientExt.prf?.results?.first;
		prfDiag('registration result', {
			credentialId: registration.id,
			authenticatorAttachment: (registration as any).authenticatorAttachment,
			transports: (registration as any).transports ?? '(helper did not surface)',
			clientExtensionKeys: Object.keys(clientExt),
			prf: clientExt.prf
				? {
						enabled: clientExt.prf.enabled,
						hasResults: !!clientExt.prf.results,
						firstByteLength: clientExt.prf.results?.first?.byteLength ?? null
					}
				: '(no prf key in clientExtensionResults)'
		});

		// Path A — CTAP2.1-style (hmac-secret-mc): the PRF was evaluated
		// during create(); finish in one round trip.
		// Path B — CTAP2.0 (fidont, most hmac-secret keys): `enabled` but no
		// results — the PRF can only be evaluated on an assertion. Stage the
		// verified registration server-side (NO slot yet), then run an
		// immediate get() with the same salt (second touch on the device).
		// Path C — the extension was not acknowledged at all: this
		// authenticator/browser cannot derive device secrets (hybrid/QR
		// phones strip PRF; some browsers never send it).
		let verifyBody: Record<string, unknown>;

		if (prfFirst) {
			verifyBody = { token: start.token, registration, prfOutput: b64(prfFirst) };
		} else if (clientExt.prf?.enabled) {
			const stageRes = await fetch('/settings/security/device/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: start.token, registration })
			});
			const staged = await stageRes.json();
			prfDiag('stage response', {
				ok: stageRes.ok,
				evalRequired: staged.evalRequired,
				allowCredentials: staged.options?.allowCredentials?.length ?? 0,
				saltB64Length: staged.salt?.length
			});
			if (!stageRes.ok || !staged.evalRequired) {
				throw new Error(staged.error ?? 'Enrollment staging failed');
			}

			const evalSalt = b64ToBytes(staged.salt);
			(staged.options as any).extensions = {
				prf: { eval: { first: evalSalt } }
			};

			const assertion = await startAuthentication({ optionsJSON: staged.options });
			const evalExt = (assertion as any).clientExtensionResults ?? {};
			const evalFirst = evalExt.prf?.results?.first;
			prfDiag('eval assertion result', {
				credentialId: assertion.id,
				clientExtensionKeys: Object.keys(evalExt),
				prf: evalExt.prf
					? {
							hasResults: !!evalExt.prf.results,
							firstByteLength: evalExt.prf.results?.first?.byteLength ?? null
						}
					: '(no prf key in clientExtensionResults)'
			});
			if (!evalFirst) {
				throw new Error(
					'Authenticator acknowledged PRF but returned no output on evaluation — enrollment refused (no slot written)'
				);
			}
			verifyBody = { token: staged.token, assertion, prfOutput: b64(evalFirst) };
		} else {
			throw new Error(
				'This authenticator/browser did not acknowledge the PRF extension — it cannot derive device secrets. ' +
					'Phones added via QR (hybrid) do not support PRF; use a directly-paired BLE/USB/NFC key with hmac-secret ' +
					'(e.g. fidont paired over Bluetooth, YubiKey fw 5.2.6+).'
			);
		}

		const verifyRes = await fetch('/settings/security/device/verify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(verifyBody)
		});
			const verified = await verifyRes.json();
			prfDiag('verify response', { ok: verifyRes.ok, payload: verified });
			if (!verifyRes.ok) throw new Error(verified.error ?? 'Enrollment failed');

			deviceDone = true;
		await invalidateAll(); // slot table + count refresh immediately
		} catch (err) {
			deviceError = err instanceof Error ? err.message : String(err);
			prfDiag('enrollment failed', { message: deviceError });
		} finally {
			deviceBusy = false;
		}
	}

	// Recovery rotation confirmation
	let confirmRecoveryRotate = $state(false);
	let confirmDeviceDisable = $state(false);
	let confirmDataKeyRotate = $state(false);

	// Inactivity timeout (mirrors layout data; falls back to 5)
	let inactivityTimeout = $state<number>(5);
	$effect(() => {
		inactivityTimeout = data?.inactivityTimeout ?? 5;
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">SECURITY — KEYRING</h1>
	<p class="text-gray-600 my-1">
		Your data is sealed under a per-user data key. Credentials are wrap slots:
		adding, rotating, or revoking them never re-encrypts your data.
	</p>
</div>

{#if form?.message && !form.recoveryPassphrase}
	<div class="border border-green-700 border-l-4 p-2 mb-4 bg-green-50">
		<span class="text-green-700 font-bold">{form.message}</span>
	</div>
{/if}

{#if form?.error}
	<div class="border border-red-700 border-l-4 p-2 mb-4 bg-red-50">
		<span class="text-red-700 font-bold">{form.error}</span>
	</div>
{/if}

<!-- ══════════ SLOT LIST (task 4.3) ══════════ -->
<div class="border-b border-black p-2">
	<h2 class="font-bold mt-0 mb-2">CREDENTIAL SLOTS</h2>

	{#if data?.promptSpareDevice}
		<div class="border border-amber-700 border-l-4 p-2 mb-2 bg-amber-50">
			<span class="text-amber-700 font-bold">
				Only one device slot enrolled — a lost device would force paper
				recovery. Enroll a spare.
			</span>
		</div>
	{/if}

	<!-- Per-account L2 switch (enrollment gate; enforcement = slots exist) -->
	{#if data?.deviceEnrollmentEnabled}
		<div class="border border-green-700 border-l-4 p-2 mb-2 bg-green-50">
			<span class="text-green-700 font-bold">[ DEVICE UNLOCK: ON (per account) ]</span>
			<span class="text-gray-600 text-xs block mt-1">
				Enrolled devices are mandatory at unlock (2-of-2) until revoked.
			</span>
		</div>

		<div class="border border-black p-2 mb-2">
			<div class="flex items-center gap-3 flex-wrap">
				{#if (data?.deviceSlotCount ?? 0) > 0}
					<span class="text-xs font-bold">
						[ {data?.deviceSlotCount} DEVICE SLOT{data?.deviceSlotCount > 1 ? 'S' : ''} ENROLLED ]
					</span>
				{/if}
				<button type="button" class="bracket-link" disabled={deviceBusy} onclick={runDeviceEnrollment}>
					{deviceBusy
						? 'Waiting for device…'
						: (data?.deviceSlotCount ?? 0) > 0
							? 'Enroll spare device (WebAuthn PRF)'
							: 'Enroll device (WebAuthn PRF)'}
				</button>
				{#if deviceDone}<span class="text-green-700 font-bold text-xs">[ ENROLLED ]</span>{/if}
			</div>
			<p class="text-gray-600 text-xs my-1">
				{#if (data?.deviceSlotCount ?? 0) > 0}
					Each enrolled device can unlock alone-with-password (2-of-2). A spare protects against losing your primary device.
				{:else}
					Enrolls your device as wrap slot 2 — unlock then requires password + device.
				{/if}
			</p>
			{#if deviceError}
				<p class="text-red-700 text-xs font-bold my-1">{deviceError}</p>
			{/if}
			{#if deviceDone && !deviceError}
				<p class="text-green-700 text-xs font-bold my-1">
					Device slot enrolled — unlock now requires password + device.
				</p>
			{/if}
		</div>

		<form method="POST" action="?/toggleDeviceEnrollment" class="mb-2">
			{#if data?.deviceSlotCount > 0}
				<label class="flex items-start gap-2 my-2 cursor-pointer text-sm">
					<input type="checkbox" bind:checked={confirmDeviceDisable} class="mt-1" />
					<span>
						Turn OFF device unlock for this account. All {data?.deviceSlotCount}
						enrolled device slot(s) will be revoked (data is NOT re-encrypted) and
						unlock returns to password-only (L1).
					</span>
				</label>
				<input type="hidden" name="enabled" value="false" />
				<button type="submit" disabled={!confirmDeviceDisable} class="bracket-link">
					Turn off device unlock
				</button>
			{:else}
				<input type="hidden" name="enabled" value="false" />
				<button type="submit" class="bracket-link">Turn off device unlock</button>
			{/if}
		</form>
	{:else}
		<div class="border border-black border-l-4 p-2 mb-2 bg-gray-50">
			<span class="font-bold">[ DEVICE UNLOCK: OFF (per account) ]</span>
			<span class="text-gray-600 text-xs block mt-1">
				Password-only unlock (L1) for this account. Enabling reveals device
				enrollment (phone/hardware key as wrap slot 2 — screen lock/UV required
				at unlock, 2-of-2).
			</span>
			{#if data?.deviceEnrollmentGlobalKill}
				<span class="text-amber-700 text-xs block mt-1">
					[!] Globally disabled pending live PRF/UV verification — set
					<code>WEBAUTHN_PRF_ENABLED=true</code> to allow enabling.
				</span>
			{/if}
			<form method="POST" action="?/toggleDeviceEnrollment" class="mt-2">
				<input type="hidden" name="enabled" value="true" />
				<button type="submit" class="bracket-link" disabled={data?.deviceEnrollmentGlobalKill}>
					Enable device unlock for this account
				</button>
			</form>
		</div>
	{/if}

	<table class="w-full text-sm border border-black">
		<thead>
			<tr class="border-b border-black">
				<th class="p-1 text-left uppercase text-[10px]">Slot</th>
				<th class="p-1 text-left uppercase text-[10px]">Enrolled</th>
				<th class="p-1 text-left uppercase text-[10px]">Notes</th>
				<th class="p-1 text-right uppercase text-[10px]">Action</th>
			</tr>
		</thead>
		<tbody>
			{#each data?.slots ?? [] as slot (slot.slotId)}
				<tr class="border-t border-black">
					<td class="p-1 font-bold">{kindLabels[slot.kind] ?? slot.kind}</td>
					<td class="p-1">{new Date(slot.createdAt).toLocaleDateString('en-GB')}</td>
					<td class="p-1 text-xs">{kindDescriptions[slot.kind] ?? ''}</td>
					<td class="p-1 text-right">
						{#if slot.kind !== 'password' && slot.kind !== 'recovery-passphrase'}
							<form method="POST" action="?/revokeSlot" use:enhance class="inline">
								<input type="hidden" name="slotId" value={slot.slotId} />
								<button type="submit" class="bracket-link">[Revoke]</button>
							</form>
						{:else if slot.kind === 'recovery-passphrase'}
							<span class="text-gray-600 text-xs">rotate below</span>
						{:else}
							<span class="text-gray-600 text-xs">—</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="text-gray-600 text-xs mt-2">
		A stolen device slot alone cannot unlock your data — unlock requires the
		password too (2-of-2). Revoking a slot never re-encrypts data.
	</p>
</div>

<!-- ══════════ RECOVERY PAPER ══════════ -->
<div class="border-b border-black p-2">
	<h2 class="font-bold mt-0 mb-2">RECOVERY PAPER</h2>

	{#if form?.recoveryPassphrase}
		<div class="border border-red-700 border-l-4 p-2 mb-2 bg-red-50">
			<span class="text-red-700 font-bold">
				New recovery passphrase — shown exactly once, never again:
			</span>
			<div class="border border-black p-2 my-2 bg-white font-mono break-words">
				{form.recoveryPassphrase}
			</div>
			<span class="text-xs">Write it down and store it offline now.</span>
		</div>
	{/if}

	{#if form?.deviceSlotsRevoked}
		<div class="border border-amber-700 border-l-4 p-2 mb-2 bg-amber-50">
			<span class="text-amber-700 font-bold">
				Device slots revoked — re-enroll your device (unlock is password-only
				until you do).
			</span>
		</div>
	{/if}

	{#if data?.recoveryEnrolled}
		<p class="text-gray-600 text-xs mb-2">
			The existing passphrase cannot be re-displayed (shown once at
			enrollment). Rotating issues a fresh one and revokes the old — your
			data is NOT re-encrypted.
		</p>
		<label class="flex items-start gap-2 my-2 cursor-pointer text-sm">
			<input type="checkbox" bind:checked={confirmRecoveryRotate} class="mt-1" />
			<span>I want a new recovery passphrase; the old one will stop working.</span>
		</label>
		<form method="POST" action="?/rotateRecoverySlot" use:enhance>
			<button type="submit" disabled={!confirmRecoveryRotate} class="bracket-link">
				Rotate recovery passphrase
			</button>
		</form>
	{:else}
		<p class="text-amber-700 font-bold text-sm">
			No recovery slot enrolled — <a href="/recovery-enroll" class="bracket-link">enroll now</a>
			(required; losing your password without it means permanent data loss).
		</p>
	{/if}
</div>

<!-- ══════════ PASSWORD CHANGE (task 3.5) ══════════ -->
<div class="border-b border-black p-2">
	<h2 class="font-bold mt-0 mb-2">CHANGE PASSWORD</h2>
	<p class="text-gray-600 text-xs mb-2">
		Re-wraps your password slot only — data and other slots are untouched.
	</p>
	<form method="POST" action="?/changePassword" use:enhance>
		<FormField
			bind:this={currentField}
			label="Current password"
			name="currentPassword"
			type="password"
			bind:value={currentPassword}
			rules={pwRules}
			autocomplete="current-password"
		/>
		<FormField
			bind:this={newField}
			label="New password"
			name="newPassword"
			type="password"
			bind:value={newPassword}
			rules={pwRules}
			placeholder="12+ chars, mixed case, number, special"
			autocomplete="new-password"
		/>
		<FormField
			bind:this={confirmField}
			label="Confirm new password"
			name="confirmPassword"
			type="password"
			bind:value={confirmPassword}
			rules={pwRules}
			autocomplete="new-password"
		/>
		<div class="mb-2 mt-2">
			<button
				type="submit"
				disabled={!currentValid || !newValid || !confirmValid}
				class="bracket-link"
			>
				Change password
			</button>
		</div>
	</form>
</div>

<!-- ══════════ SEAL DEADLINE ══════════ -->
<div class="border-b border-black p-2">
	<h2 class="font-bold mt-0 mb-2">SEAL AFTER INACTIVITY</h2>
	<p class="text-gray-600 text-xs mb-2">
		Idle timeout now SEALS: the data key is wiped from memory and the unlock
		ceremony is required to continue.
	</p>
	<form method="POST" action="?/saveInactivityTimeout" use:enhance class="flex items-center gap-2">
		<select name="inactivityTimeout" bind:value={inactivityTimeout} class="border border-black p-1 bg-white">
			<option value={1}>1 minute</option>
			<option value={5}>5 minutes</option>
			<option value={10}>10 minutes</option>
		</select>
		<button type="submit" class="bracket-link">Save</button>
	</form>
</div>

<!-- ══════════ FULL DATA-KEY ROTATION (task 4.4) ══════════ -->
<div class="border-b border-black p-2">
	<h2 class="font-bold mt-0 mb-2 text-red-700">EMERGENCY: RECOVERY PAPER COMPROMISED</h2>
	<p class="text-gray-600 text-xs mb-2">
		Full data-key rotation re-encrypts EVERYTHING under a fresh key and
		re-wraps every slot. Reserved for suspected compromise of the recovery
		passphrase — device loss needs only slot revocation above.
	</p>
	<label class="flex items-start gap-2 my-2 cursor-pointer text-sm">
		<input type="checkbox" bind:checked={confirmDataKeyRotate} class="mt-1" />
		<span>
			I suspect the paper passphrase is compromised. I understand this
			re-encrypts all data and issues a new passphrase.
		</span>
	</label>
	{#if confirmDataKeyRotate}
		<form method="POST" action="?/rotateDataKey" use:enhance class="mb-2">
			<FormField
				bind:this={rotationField}
				label="Confirm password"
				name="password"
				type="password"
				bind:value={rotationPassword}
				rules={pwRules}
				autocomplete="current-password"
			/>
			<div class="mt-2">
				<button type="submit" disabled={!rotationValid} class="bracket-link">
					Rotate data key (full re-encryption)
				</button>
			</div>
		</form>
	{/if}
</div>
