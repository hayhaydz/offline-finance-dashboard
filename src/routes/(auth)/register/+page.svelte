<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="auth-container">
	<h1>Create Account</h1>
	<p class="subtitle">Register with username and password</p>

	<form method="POST" use:enhance>
		<div class="form-group">
			<label for="username">Username</label>
			<input
				type="text"
				id="username"
				name="username"
				required
				minlength="3"
				maxlength="50"
				pattern="[a-zA-Z0-9_-]+"
				title="Username must be 3-50 characters (letters, numbers, underscore, hyphen only)"
				autocomplete="username"
			/>
		</div>

		<div class="form-group">
			<label for="password">Password</label>
			<input
				type="password"
				id="password"
				name="password"
				required
				minlength="12"
				autocomplete="new-password"
			/>
			<small>Minimum 12 characters</small>
		</div>

		<div class="form-group">
			<label for="confirmPassword">Confirm Password</label>
			<input
				type="password"
				id="confirmPassword"
				name="confirmPassword"
				required
				minlength="12"
				autocomplete="new-password"
			/>
		</div>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button type="submit">Continue to MFA Setup</button>
	</form>

	<p class="auth-link">
		Already have an account? <a href="/login">Log in</a>
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
	.auth-link {
		margin-top: 1rem;
		text-align: center;
	}
	.subtitle {
		color: #666;
		margin-bottom: 1.5rem;
	}
</style>
