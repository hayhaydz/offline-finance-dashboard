<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	let { form, data } = $props();

	// QR code data URL from load function (reactive)
	const qrCodeUrl = $derived(data?.qrCodeUrl);
	const backupCodes = $derived(data?.backupCodes);
	const username = $derived(data?.username);
</script>

<div class="max-w-[500px] mx-8 p-8 border border-gray-300">
	<h1>Set Up Two-Factor Authentication</h1>
	<p class="text-gray-600 mb-6">
		Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
	</p>

	{#if qrCodeUrl}
		<div class="text-center my-8 p-4 bg-gray-50 rounded-lg">
			<img src={qrCodeUrl} alt="QR Code for TOTP Setup" class="max-w-[200px] mx-auto" />
			<p class="mt-4 font-bold">{username}</p>
		</div>
	{/if}

	{#if backupCodes}
		<div class="my-8 p-4 bg-yellow-50 border border-yellow-500 rounded">
			<h2 class="mt-0 text-lg">Save Your Backup Codes</h2>
			<p class="text-sm text-yellow-800 my-2">
				Store these codes securely. You can use them to access your account if you lose
				access to your authenticator device.
			</p>
			<ul class="grid grid-cols-2 gap-2 list-none p-0 my-4 font-mono text-lg">
				{#each backupCodes as code}
					<li class="p-1 px-2 bg-white border border-gray-300 text-center">{code}</li>
				{/each}
			</ul>
			<p class="text-sm text-yellow-800 my-2">These codes will not be shown again.</p>
		</div>
	{/if}

	<form method="POST" use:enhance>
		<div class="mb-4">
			<label for="totpCode" class="block mb-1 font-bold">Enter Authentication Code</label>
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
				class="w-full p-2 box-border border border-gray-300"
			/>
			<small class="block mt-1 text-gray-600 text-sm">Enter the 6-digit code from your authenticator app</small>
		</div>

		{#if form?.error}
			<p class="text-red-600 my-4">{form.error}</p>
		{/if}

		{#if form?.success}
			<p class="text-green-800 bg-green-100 p-4 rounded my-4">
				Registration complete! You can now <a href="/login">log in</a>.
			</p>
		{/if}

		<button type="submit" disabled={form?.success} class="w-full p-3 bg-black text-white border-none cursor-pointer">
			Verify and Complete Registration
		</button>
	</form>

	<p class="mt-4 text-center text-sm text-gray-600">
		Can't scan the QR code? Your manual entry key is shown in the authenticator app setup.
	</p>
</div>
