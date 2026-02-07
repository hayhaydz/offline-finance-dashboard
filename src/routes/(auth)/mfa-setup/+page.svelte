<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	let { form, data } = $props();

	// QR code data URL from load function
	const qrCodeUrl = data?.qrCodeUrl;
	const backupCodes = data?.backupCodes;
	const username = data?.username;
</script>

<div class="auth-container mfa-setup">
	<h1>Set Up Two-Factor Authentication</h1>
	<p class="subtitle">
		Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
	</p>

	{#if qrCodeUrl}
		<div class="qr-container">
			<img src={qrCodeUrl} alt="QR Code for TOTP Setup" />
			<p class="username">{username}</p>
		</div>
	{/if}

	{#if backupCodes}
		<div class="backup-codes">
			<h2>Save Your Backup Codes</h2>
			<p class="warning">
				Store these codes securely. You can use them to access your account if you lose
				access to your authenticator device.
			</p>
			<ul class="codes-list">
				{#each backupCodes as code}
					<li>{code}</li>
				{/each}
			</ul>
			<p class="warning">These codes will not be shown again.</p>
		</div>
	{/if}

	<form method="POST" use:enhance>
		<div class="form-group">
			<label for="totpCode">Enter Authentication Code</label>
			<input
				type="text"
				id="totpCode"
				name="totpCode"
				required
				minlength="6"
				maxlength="6"
				pattern="[0-9]{6}"
				placeholder="123456"
				autocomplete="one-time-code"
				inputmode="numeric"
			/>
			<small>Enter the 6-digit code from your authenticator app</small>
		</div>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		{#if form?.success}
			<p class="success">
				Registration complete! You can now <a href="/login">log in</a>.
			</p>
		{/if}

		<button type="submit" disabled={form?.success}>
			Verify and Complete Registration
		</button>
	</form>

	<p class="manual-entry">
		Can't scan the QR code? Your manual entry key is shown in the authenticator app setup.
	</p>
</div>

<style>
	.mfa-setup {
		max-width: 500px;
	}
	.qr-container {
		text-align: center;
		margin: 2rem 0;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 8px;
	}
	.qr-container img {
		max-width: 200px;
		margin: 0 auto;
	}
	.qr-container .username {
		margin-top: 1rem;
		font-weight: bold;
	}
	.backup-codes {
		margin: 2rem 0;
		padding: 1rem;
		background: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 4px;
	}
	.backup-codes h2 {
		margin-top: 0;
		font-size: 1.1rem;
	}
	.warning {
		font-size: 0.9rem;
		color: #856404;
		margin: 0.5rem 0;
	}
	.codes-list {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 1rem 0;
		font-family: monospace;
		font-size: 1.1rem;
	}
	.codes-list li {
		padding: 0.25rem 0.5rem;
		background: #fff;
		border: 1px solid #ddd;
		text-align: center;
	}
	.success {
		color: #388e3c;
		background: #c8e6c9;
		padding: 1rem;
		border-radius: 4px;
		margin: 1rem 0;
	}
	.manual-entry {
		margin-top: 1rem;
		text-align: center;
		font-size: 0.85rem;
		color: #666;
	}
	.auth-container {
		max-width: 400px;
		margin: 2rem auto;
		padding: 2rem;
		border: 1px solid #ccc;
	}
	.form-group {
		margin-bottom: 1rem;
	}
	label {
		display: block;
		margin-bottom: 0.25rem;
		font-weight: bold;
	}
	input {
		width: 100%;
		padding: 0.5rem;
		box-sizing: border-box;
		border: 1px solid #ccc;
	}
	.error {
		color: #d32f2f;
		margin: 1rem 0;
	}
	button {
		width: 100%;
		padding: 0.75rem;
		background: #000;
		color: #fff;
		border: none;
		cursor: pointer;
	}
	.subtitle {
		color: #666;
		margin-bottom: 1.5rem;
	}
</style>
