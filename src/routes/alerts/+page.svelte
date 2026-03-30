<script lang="ts">
	import { groupAlertsByTitle } from '$lib/types/alerts';
	import AlertGroup from '$lib/components/AlertGroup.svelte';

	let { data } = $props();

	const redGroups   = $derived(groupAlertsByTitle(data.redAlerts));
	const amberGroups = $derived(groupAlertsByTitle(data.amberAlerts));
	const infoGroups  = $derived(groupAlertsByTitle(data.infoAlerts));
</script>

<div class="">
	<div class="border-b border-black p-2 font-bold flex justify-between items-center bg-white text-sm">
		<span>ALERTS ({data.total})</span>
		<a href="/" class="bracket-link text-xs">Homepage</a>
	</div>

	{#if data.total === 0}
		<div class="p-4 text-sm text-zinc-500 font-mono">[i] No alerts — all clear</div>
	{:else}

		{#if redGroups.length > 0}
			<div class="border-b border-black px-2 py-1 bg-red-100 text-xs font-bold font-mono text-red-700">
				[!!] CRITICAL ({data.redAlerts.length})
			</div>
			{#each redGroups as group (group.title)}
				<AlertGroup {group} />
			{/each}
		{/if}

		{#if amberGroups.length > 0}
			<div class="border-b border-black px-2 py-1 bg-amber-100 text-xs font-bold font-mono text-amber-700">
				[!] WARNINGS ({data.amberAlerts.length})
			</div>
			{#each amberGroups as group (group.title)}
				<AlertGroup {group} />
			{/each}
		{/if}

		{#if infoGroups.length > 0}
			<div class="border-b border-black px-2 py-1 bg-gray-100 text-xs font-bold font-mono text-zinc-500">
				[i] INFORMATION ({data.infoAlerts.length})
			</div>
			{#each infoGroups as group (group.title)}
				<AlertGroup {group} />
			{/each}
		{/if}

	{/if}
</div>

