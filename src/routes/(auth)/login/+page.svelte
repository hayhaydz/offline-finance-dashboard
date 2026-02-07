<script lang="ts">
	import { enhance } from '$app/forms';
	let { form, data } = $props();

	let showDelayMessage = $state(false);
	let delayCountdown = $state(0);

	// Handle rate limit delay countdown
	if (data?.delay) {
		showDelayMessage = true;
		delayCountdown = Math.ceil(data.delay / 1000);
		const interval = setInterval(() => {
			delayCountdown--;
			if (delayCountdown <= 0) {
				clearInterval(interval);
				showDelayMessage = false;
			}
		}, 1000);
	}
</script>

<div class="auth-container">
	<h1>Log In</h1>
	<p class="subtitle">Enter your credentials and authentication code</p>

	{#if data?.locked}
		<div class="error-box">
			<h2>Account Locked</h2>
			<p>
				Too many failed login attempts. Your account has been locked for 15 minutes.
				Please try again later.
			</p>
		</div>
	{:else}
		<form method="POST" use:enhance>
			<div class="form-group">
				<label for="username">Username</label>
				<input
					type="text"
					id="username"
					name="username"
					required
					autocomplete="username"
					disabled={showDelayMessage}
				/>
			</div>

			<div class="form-group">
				<label for="password">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					required
					autocomplete="current-password"
					disabled={showDelayMessage}
				/>
			</div>

			<div class="form-group">
				<label for="totpCode">Authentication Code</label>
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
					disabled={showDelayMessage}
				/>
				<small>Enter the 6-digit code from your authenticator app</small>
			</div>

			{#if showDelayMessage}
				<div class="delay-message">
					Too many failed attempts. Please wait {delayCountdown} seconds before trying again.
				</div>
			{/if}

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button type="submit" disabled={showDelayMessage || data?.locked}>
				Log In
			</button>
		</form>
	{/if}

	<p class="auth-link">
		Don't have an account? <a href="/register">Register</a>
	</p>
</div>

<style>
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
	input:disabled {
		background: #f0f0f0;
		cursor: not-allowed;
	}
	small {
		display: block;
		margin-top: 0.25rem;
		color: #666;
		font-size: 0.85rem;
	}
	.error {
		color: #d32f2f;
		margin: 1rem 0;
	}
	.error-box {
		background: #ffebee;
		border: 1px solid #d32f2f;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1rem;
	}
	.error-box h2 {
		margin-top: 0;
		color: #d32f2f;
		font-size: 1.1rem;
	}
	.error-box p {
		margin-bottom: 0;
	}
	.delay-message {
		background: #fff3cd;
		border: 1px solid #ffc107;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		text-align: center;
	}
	button {
		width: 100%;
		padding: 0.75rem;
		background: #000;
		color: #fff;
		border: none;
		cursor: pointer;
	}
	button:disabled {
		background: #666;
		cursor: not-allowed;
	}
	.auth-link {
		margin-top: 1rem;
		text-align: center;
	}
	.subtitle {
		color: #666;
		margin-bottom: 1.5rem;
	}
</style>
