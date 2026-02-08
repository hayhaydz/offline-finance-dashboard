<script lang="ts">
	import Navigation from '$lib/components/navigation.svelte';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	const user = $derived(page.data.user ?? null);
	const environment = $derived(page.data.environment ?? { mode: 'unknown', isProduction: false, hasEncryption: false });

	// Environment mode indicator
	const modeIndicator = $derived(
		environment.isProduction
			? '[ MODE: SECURE ]'
			: environment.hasEncryption
				? '[ MODE: LOOSE / ENCRYPTED ]'
				: '[ MODE: LOOSE / UNENCRYPTED ]'
	);

	let { children } = $props<{ children: Snippet }>();
</script>

<div class="border border-black max-w-4xl mx-auto w-full">
	{#if user}
		<div class="bg-black text-white p-1 font-bold text-xs flex justify-between">
			<span>OFFLINE-FINANCE-v0.exe</span>
			<span>USER: {user.username.toUpperCase()}</span>
			<span>{modeIndicator}</span>
		</div>
	{/if}

	{@render children()}

	<Navigation {user} {environment} />
</div>
