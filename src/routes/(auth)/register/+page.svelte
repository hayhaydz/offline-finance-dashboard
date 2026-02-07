<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="max-w-[400px] mx-8 p-8 border border-gray-300">
	<h1>Create Account</h1>
	<p class="text-gray-600 mb-6">Register with username and password</p>

	<form method="POST" use:enhance>
		<div class="mb-4">
			<label for="username" class="block mb-1 font-bold">Username</label>
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
				class="w-full p-2 box-border border border-gray-300"
			/>
		</div>

		<div class="mb-4">
			<label for="password" class="block mb-1 font-bold">Password</label>
			<input
				type="password"
				id="password"
				name="password"
				required
				minlength="12"
				autocomplete="new-password"
				class="w-full p-2 box-border border border-gray-300"
			/>
			<small class="block mt-1 text-gray-600 text-sm">Minimum 12 characters</small>
		</div>

		<div class="mb-4">
			<label for="confirmPassword" class="block mb-1 font-bold">Confirm Password</label>
			<input
				type="password"
				id="confirmPassword"
				name="confirmPassword"
				required
				minlength="12"
				autocomplete="new-password"
				class="w-full p-2 box-border border border-gray-300"
			/>
		</div>

		{#if form?.error}
			<p class="text-red-600 my-4">{form.error}</p>
		{/if}

		<button type="submit" class="w-full p-3 bg-black text-white border-none cursor-pointer">
			Continue to MFA Setup
		</button>
	</form>

	<p class="mt-4 text-center">
		Already have an account? <a href="/login">Log in</a>
	</p>
</div>
