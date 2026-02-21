<script lang="ts">
	import { enhance } from '$app/forms';
	import { browser } from '$app/environment';
	import FormField from '$lib/components/ui/form-field/form-field.svelte';
	import SettingsNav from '$lib/components/SettingsNav.svelte';
	import { required, minLength, hasUppercase, hasLowercase, hasNumber, hasSpecial, matches } from '$lib/validation/rules';
	import type { ActionData } from './$types';

	let { data, form } = $props();

	// State for modals
	let showConfirmModal = $state<boolean>(false);
	let showCodesModal = $state<boolean>(false);
	let newBackupCodes = $state<string[] | null>(null);
	let regenerationError = $state<string | null>(null);
	let isRegenerating = $state<boolean>(false);
	let copiedCodeIndex = $state<number | null>(null);

	// Handle keyboard (Escape to close modals)
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeModals();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			closeModals();
		}
	}

	// Handle backdrop keyboard (Enter/Space to close)
	function handleBackdropKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			if (e.target === e.currentTarget) {
				e.preventDefault();
				closeModals();
			}
		}
	}

	// Close all modals
	function closeModals() {
		if (showCodesModal) {
			// Intentionally lose codes when closing codes modal
			showCodesModal = false;
			newBackupCodes = null;
		}
		if (showConfirmModal) {
			showConfirmModal = false;
		}
	}

	// Start regeneration flow
	function startRegeneration() {
		showConfirmModal = true;
		regenerationError = null;
	}

	// Handle form success
	function handleFormSuccess({ result }: { result: any }) {
		if (result.type === 'success' && result.data?.success) {
			// Show codes modal with plaintext codes
			newBackupCodes = result.data.codes;
			showCodesModal = true;
			showConfirmModal = false;
			isRegenerating = false;
		} else if (result.type === 'failure') {
			regenerationError = result.data?.error || 'Failed to regenerate backup codes';
			isRegenerating = false;
		}
	}

	// Copy code to clipboard
	async function copyCode(code: string, index: number) {
		if (!browser) return;

		try {
			await navigator.clipboard.writeText(code);
			copiedCodeIndex = index;
			// Clear feedback after 2 seconds
			setTimeout(() => {
				copiedCodeIndex = null;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy code:', error);
		}
	}

	// Close codes modal and lose codes
	function closeCodesModal() {
		showCodesModal = false;
		newBackupCodes = null;
		copiedCodeIndex = null;
	}

	// Handle password change form success
	function handlePasswordChange({ result }: { result: any }) {
		if (result.type === 'success' && result.data?.success) {
			// Redirect to login with success message
			if (browser) {
				window.location.href = '/login?success=' + encodeURIComponent('Password changed successfully. Please log in with your new password.');
			}
		}
	}

	// Password change form field values
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	// Form data for cross-field validation
	const passwordFormData = $derived.by(() => ({
		currentPassword,
		newPassword,
		confirmPassword
	}));

	// Validation rules for each field
	const currentPasswordRules = [required('Current password is required')];
	const newPasswordRules = [
		required('New password is required'),
		minLength(12, 'Password must be at least 12 characters'),
		hasUppercase(),
		hasLowercase(),
		hasNumber(),
		hasSpecial()
	];
	const confirmPasswordRules = [
		required('Please confirm your new password'),
		matches('newPassword', 'Passwords must match')
	];

	// Form validation state
	let currentPasswordValid = $state(false);
	let newPasswordValid = $state(false);
	let confirmPasswordValid = $state(false);

	// Form is valid when all fields are valid
	const isPasswordFormValid = $derived(
		currentPasswordValid && newPasswordValid && confirmPasswordValid
	);

	// Component refs for validation access
	let currentPasswordField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let newPasswordField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();
	let confirmPasswordField = $state<{ isValid: boolean; validate: () => boolean } | undefined>();

	// Update validation state when fields change
	$effect(() => {
		currentPasswordValid = currentPasswordField?.isValid ?? false;
		newPasswordValid = newPasswordField?.isValid ?? false;
		confirmPasswordValid = confirmPasswordField?.isValid ?? false;
	});

	// MFA status from server data
	const mfaEnabled = $derived(data.mfaEnabled ?? false);
	const mfaEnabledDate = $derived(data.mfaEnabledDate);
	const totalCodes = $derived(data.totalCodes ?? 10);
	const usedCodes = $derived(data.usedCodes ?? 0);
	const remainingCodes = $derived(data.remainingCodes ?? 10);
</script>

<svelte:window onkeydown={handleKeydown} />

<main>
	<SettingsNav current="security" />
		<!-- PASSWORD CHANGE SECTION -->
		<section>
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>PASSWORD</span>
			</div>
			<div class="bg-gray-50 p-4 border-b border-black">
				<h2 class="mt-0 mb-2">Change Password</h2>
				<p class="mb-4 text-xs">
					After changing your password, you will be logged out of all sessions and need to log in again.
				</p>

				<form
					method="POST"
					action="?/changePassword"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							handlePasswordChange({ result });
						};
					}}
				>
					<FormField
						bind:this={currentPasswordField}
						label="Current Password"
						name="currentPassword"
						type="password"
						bind:value={currentPassword}
						rules={currentPasswordRules}
						placeholder="Enter current password"
						autocomplete="current-password"
						formData={passwordFormData}
					/>

					<FormField
						bind:this={newPasswordField}
						label="New Password"
						name="newPassword"
						type="password"
						bind:value={newPassword}
						rules={newPasswordRules}
						placeholder="Enter new password (12+ characters, mixed case, number, special)"
						autocomplete="new-password"
						formData={passwordFormData}
					/>

					<FormField
						bind:this={confirmPasswordField}
						label="Confirm New Password"
						name="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						rules={confirmPasswordRules}
						placeholder="Confirm new password"
						autocomplete="new-password"
						formData={passwordFormData}
					/>

					{#if form?.error}
						<p class="text-red-700 font-bold my-2">{form.error}</p>
					{/if}

					<div class="mb-2">
						<button
							type="submit"
							disabled={!isPasswordFormValid}
							class="bracket-link disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
						>
							[Change Password]
						</button>
					</div>
				</form>

				<p class="mt-2 mb-0 text-xs text-gray-600">
					<strong>Password requirements:</strong> At least 12 characters with uppercase, lowercase, number, and special character.
				</p>
			</div>
		</section>

		<section>
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>TWO-FACTOR AUTHENTICATION</span>
			</div>
			<div class="bg-gray-50 p-4 border-b border-black">
				<h2 class="mt-0 mb-2">MFA Status</h2>
				<div class="flex justify-between my-1">
					<span><strong>Status:</strong></span>
					<span
						class:bg-green-50={mfaEnabled}
						class:text-green-700={mfaEnabled}
						class:bg-red-50={!mfaEnabled}
						class:text-red-700={!mfaEnabled}
						class:px-2={mfaEnabled || !mfaEnabled}
						class:py-1={mfaEnabled || !mfaEnabled}
					>
						{mfaEnabled ? 'Enabled' : 'Disabled'}
					</span>
				</div>
				{#if mfaEnabled && mfaEnabledDate}
					<div class="flex justify-between my-1 text-xs text-gray-600">
						<span><strong>Enabled since:</strong></span>
						<span>{mfaEnabledDate.toLocaleDateString()}</span>
					</div>
				{/if}
				<p class="mt-2 mb-0 text-xs">
					Your account is protected by TOTP-based two-factor authentication.
				</p>
			</div>
		</section>

		<section>
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>BACKUP CODES</span>
			</div>
			<div class="bg-gray-50 p-4">
				<h2 class="mt-0 mb-2">Backup Codes</h2>
				<div class="flex justify-between my-1">
					<span><strong>Total codes:</strong></span>
					<span class:px-2={true} class:py-1={true} class:bg-gray-200={true}>
						{totalCodes}
					</span>
				</div>
				<div class="flex justify-between my-1">
					<span><strong>Remaining codes:</strong></span>
					<span class:px-2={true} class:py-1={true} class:bg-gray-200={true}>
						{remainingCodes} / {totalCodes}
					</span>
				</div>
				{#if usedCodes > 0}
					<div class="flex justify-between my-1 text-xs text-gray-600">
						<span><strong>Used codes:</strong></span>
						<span>{usedCodes}</span>
					</div>
				{/if}
				<p class="mt-2 mb-2 text-xs">
					Backup codes can be used to access your account if you lose your TOTP device. Each
					code can only be used once.
				</p>

				{#if !mfaEnabled}
					<p class="mb-2 text-xs text-red-700">
						[!] MFA is not enabled. Backup codes are only available when MFA is active.
					</p>
				{:else}
					<button
						type="button"
						onclick={startRegeneration}
						disabled={isRegenerating}
						class="px-3 py-1 border border-black hover:bg-black hover:text-white text-sm disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
					>
						[{isRegenerating ? 'Regenerating...' : 'Regenerate Backup Codes'}]
					</button>
				{/if}

				{#if regenerationError}
					<p class="mt-2 text-xs text-red-700">Error: {regenerationError}</p>
				{/if}
			</div>
		</section>
</main>

<!-- CONFIRMATION MODAL -->
{#if showConfirmModal}
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-title"
		tabindex="-1"
	>
		<div class="bg-white border-2 border-black p-4 max-w-md w-full mx-4">
			<h2 id="confirm-title" class="text-base font-bold mb-2 mt-0">Confirm Regeneration</h2>
			<p class="mb-4 text-sm">
				Are you sure you want to regenerate your backup codes? This will immediately
				invalidate all existing backup codes. You will not be able to use old codes after
				regeneration.
			</p>

			<div class="flex gap-2 justify-end">
				<button
					onclick={() => (showConfirmModal = false)}
					class="bracket-link px-3 py-1 border border-black hover:bg-gray-200 text-sm"
					type="button"
				>
					[Cancel]
				</button>
				<form
					method="POST"
					action="?/regenerateBackupCodes"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							handleFormSuccess({ result });
						};
					}}
				>
					<button
						type="submit"
						onclick={() => (isRegenerating = true)}
						class="px-3 py-1 border border-black bg-red-700 text-white hover:bg-red-800 text-sm font-bold"
						disabled={isRegenerating}
					>
						[{isRegenerating ? 'Regenerating...' : 'Regenerate'}]
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- CODES DISPLAY MODAL -->
{#if showCodesModal && newBackupCodes}
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="codes-title"
		tabindex="-1"
	>
		<div class="bg-white border-2 border-black mx-4 shadow-[8px_8px_0_rgba(0,0,0,0.2)]" style="width: 500px; max-width: 95vw;">
			<!-- Title bar -->
			<div class="bg-black text-white px-2 py-0.5 flex justify-between items-center text-xs font-bold">
				<span id="codes-title">BACKUP CODES</span>
				<button
					type="button"
					class="bg-black text-white border-none p-0 hover:bg-white hover:text-black"
					onclick={closeCodesModal}
					aria-label="Close modal"
				>
					[X]
				</button>
			</div>

			<!-- Content -->
			<div class="p-4">
				<!-- Warning message -->
				<div class="text-xs text-red-700 mb-4 font-bold border border-red-700 bg-red-50 p-2">
					SAVE THESE CODES NOW. You will not see them again.
				</div>

				<!-- Codes grid -->
				<div class="grid grid-cols-2 gap-2 mb-4">
					{#each newBackupCodes as code, index (index)}
						<div class="border border-black p-2 flex justify-between items-center">
							<span class="font-mono text-sm font-bold">{code}</span>
							<button
								type="button"
								onclick={() => copyCode(code, index)}
								class="text-xs bracket-link"
								aria-label="Copy code"
							>
								[{copiedCodeIndex === index ? 'Copied!' : 'Copy'}]
							</button>
						</div>
					{/each}
				</div>

				<!-- Footer note -->
				<div class="text-xs text-gray-600 border-t border-dotted border-gray-400 pt-2">
					Each backup code can only be used once. Store them securely. When you close this
					modal, the codes will be lost.
				</div>
			</div>

			<!-- Footer -->
			<div class="flex justify-end px-4 py-2 bg-gray-100 border-t border-black">
				<button
					type="button"
					onclick={closeCodesModal}
					class="bg-white border border-black px-3 py-1 font-terminal text-sm hover:bg-black hover:text-white"
				>
					[I have saved my codes]
				</button>
			</div>
		</div>
	</div>
{/if}
