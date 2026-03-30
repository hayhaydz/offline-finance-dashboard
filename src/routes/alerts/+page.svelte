<script lang="ts">
	import AlertBadge from '$lib/components/AlertBadge.svelte';

	let { data } = $props();
</script>

<div class="border border-black mt-4 mb-8">
	<div class="border-b border-black p-2 font-bold flex justify-between items-center bg-white text-sm">
		<span>ALERTS ({data.total})</span>
		<a href="/" class="bracket-link text-xs">Homepage</a>
	</div>

	{#if data.total === 0}
		<div class="p-4 text-sm text-zinc-500 font-mono">[i] No alerts — all clear</div>
	{:else}

		{#if data.userAlerts.length > 0}
			<div class="border-b border-black px-2 py-1 bg-gray-100 text-xs font-bold font-mono">USER ALERTS</div>
			{#each data.userAlerts as alert (alert.id)}
				<AlertBadge {alert} />
			{/each}
		{/if}

		{#each data.accountGroups as group (group.slug)}
			<div class="border-b border-black px-2 py-1 bg-gray-100 text-xs font-bold font-mono flex justify-between">
				<span>ACCOUNT ALERTS — {group.name}</span>
				<a href="/accounts/{group.slug}" class="bracket-link">View Account</a>
			</div>
			{#each group.alerts as alert (alert.id)}
				<AlertBadge {alert} />
			{/each}
		{/each}

	{/if}
</div>
