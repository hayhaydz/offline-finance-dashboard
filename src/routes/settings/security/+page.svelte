<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormField } from '$lib/components/ui/index';
	import { required } from '$lib/validation/rules';

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

	// Recovery rotation confirmation
	let confirmRecoveryRotate = $state(false);
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

	{#if data?.deviceSlotCount === 0}
		<div class="border border-black border-l-4 p-2 mb-2 bg-gray-50">
			<span class="font-bold">[ DEVICE ENROLLMENT: L2 ]</span>
			<span class="text-gray-600 text-xs block mt-1">
				Password-only unlock (L1). Phone/device share enrollment arrives with
				WebAuthn PRF support — the keyring is already slot-ready.
			</span>
		</div>
	{/if}

	<table class="w-full text-sm border border-black">
		<thead>
			<tr class="bg-black text-white">
				<th class="p-1 text-left">SLOT</th>
				<th class="p-1 text-left">ENROLLED</th>
				<th class="p-1 text-left">NOTES</th>
				<th class="p-1 text-right">ACTION</th>
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
