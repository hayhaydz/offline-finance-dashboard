<script lang="ts">
	import Navigation from '$lib/components/navigation.svelte';
	import { page } from '$app/stores';

	// Svelte 5: use $derived with page store
	const user = $derived($page.data.user ?? null);
</script>

<div class="border border-black max-w-4xl mx-auto w-full">
	{#if user}
		<div class="bg-black text-white p-1 font-bold text-xs flex justify-between">
			<span>OFFLINE-FINANCE-v0.exe</span>
			<span>USER: {user.username.toUpperCase()}</span>
		</div>
	{/if}

	<slot />

	<Navigation {user} />
</div>
