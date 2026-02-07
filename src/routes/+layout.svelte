<script lang="ts">
	import Navigation from '$lib/components/navigation.svelte';
	import { page } from '$app/stores';

	$: user = $page.data.user;
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
