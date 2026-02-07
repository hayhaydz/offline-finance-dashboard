<script lang="ts">
	import { enhance } from '$app/forms';

	interface ActionData {
		error?: string;
		locked?: boolean;
		delay?: number;
	}

	let { form, data }: { form: ActionData; data: any } = $props();

	let showDelayMessage = $state(false);
	let delayCountdown = $state(0);

	$effect(() => {
		// Handle rate limit delay countdown
		if (form?.delay) {
			showDelayMessage = true;
			delayCountdown = Math.ceil(form.delay / 1000);
			const interval = setInterval(() => {
				delayCountdown--;
				if (delayCountdown <= 0) {
					clearInterval(interval);
					showDelayMessage = false;
				}
			}, 1000);
			return () => clearInterval(interval);
		}
	});
</script>

<div class="max-w-[400px] mx-8 p-8 border border-gray-300">
	<h1>Log In</h1>
	<p class="text-gray-600 mb-6">Enter your credentials and authentication code</p>

	{#if form?.locked}
		<div class="bg-red-50 border border-red-600 p-4 rounded mb-4">
			<h2 class="mt-0 text-red-600 text-lg">Account Locked</h2>
			<p class="mb-0">
				Too many failed login attempts. Your account has been locked for 15 minutes.
				Please try again later.
			</p>
		</div>
	{:else}
		<form method="POST" use:enhance>
			<div class="mb-4">
				<label for="username" class="block mb-1 font-bold">Username</label>
				<input
					type="text"
					id="username"
					name="username"
					required
					autocomplete="username"
					disabled={showDelayMessage}
					class="w-full p-2 box-border border border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
				/>
			</div>

			<div class="mb-4">
				<label for="password" class="block mb-1 font-bold">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					required
					autocomplete="current-password"
					disabled={showDelayMessage}
					class="w-full p-2 box-border border border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
				/>
			</div>

			<div class="mb-4">
				<label for="totpCode" class="block mb-1 font-bold">Authentication Code</label>
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
					class="w-full p-2 box-border border border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
				/>
				<small class="block mt-1 text-gray-600 text-sm">Enter the 6-digit code from your authenticator app</small>
			</div>

			{#if showDelayMessage}
				<div class="bg-yellow-50 border border-yellow-500 p-3 rounded mb-4 text-center">
					Too many failed attempts. Please wait {delayCountdown} seconds before trying again.
				</div>
			{/if}

			{#if form?.error}
				<p class="text-red-600 my-4">{form.error}</p>
			{/if}

			<button type="submit" disabled={showDelayMessage || form?.locked} class="w-full p-3 bg-black text-white border-none cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed">
				Log In
			</button>
		</form>
	{/if}

	<p class="mt-4 text-center">
		Don't have an account? <a href="/register">Register</a>
	</p>
</div>
