<script lang="ts">
	import { groupAlertsByTitle } from '$lib/types/alerts';
	import AlertGroup from '$lib/components/AlertGroup.svelte';

	// R12 (v3 B11): digestible alerts — a severity summary strip first
	// (counts at a glance), then severity LANES side by side at wide
	// viewports (R29) instead of one long vertical wall. Groups keep
	// their expand/ack/snooze behaviour.

	let { data } = $props();

	const redGroups     = $derived(groupAlertsByTitle(data.redAlerts));
	const amberGroups   = $derived(groupAlertsByTitle(data.amberAlerts));
	const infoGroups    = $derived(groupAlertsByTitle(data.infoAlerts));
	const ackedGroups   = $derived(groupAlertsByTitle(data.acknowledged));

	let showAcked = $state(false);

	const affectedAccounts = $derived(() => {
		const names = new Set<string>();
		for (const alert of [...data.redAlerts, ...data.amberAlerts, ...data.infoAlerts]) {
			if (alert.accountName) names.add(alert.accountName);
		}
		return names.size;
	});
</script>

<div class="">
	<div class="border-b border-black p-2 font-bold flex justify-between items-center gap-4 bg-white text-sm">
		<span>ALERTS ({data.total}){#if data.total > 0}<span class="text-xs text-gray-500 font-normal">· {affectedAccounts()} account{affectedAccounts() !== 1 ? 's' : ''} affected</span>{/if}</span>
		<a href="/" class="bracket-link text-xs">Homepage</a>
	</div>

	<!-- severity summary strip (R12): three cells, aligned with the lanes below -->
	{#if data.total > 0}
		<div class="border-b border-black grid grid-cols-3 divide-x divide-gray-300">
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">Critical</div>
				<div class="text-sm font-bold {data.redAlerts.length > 0 ? 'text-red-700' : 'text-gray-400'}">{data.redAlerts.length}</div>
			</div>
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">Warnings</div>
				<div class="text-sm font-bold {data.amberAlerts.length > 0 ? 'text-amber-700' : 'text-gray-400'}">{data.amberAlerts.length}</div>
			</div>
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">Info</div>
				<div class="text-sm font-bold {data.infoAlerts.length > 0 ? '' : 'text-gray-400'}">{data.infoAlerts.length}</div>
			</div>
		</div>
	{/if}

	{#if data.total === 0 && data.acknowledged.length === 0}
		<div class="p-4 text-sm text-zinc-500 font-mono">[i] No alerts — all clear</div>
	{:else if data.total === 0}
		<div class="p-4 text-sm text-zinc-500 font-mono">[i] No active alerts — {data.acknowledged.length} acknowledged</div>
	{:else}

		<!-- severity lanes (R29): red | amber | info side by side when wide -->
		<div class="grid lg:grid-cols-3 md:divide-x md:divide-gray-300">
			<!-- CRITICAL lane -->
			<div class="{data.redAlerts.length === 0 ? 'hidden lg:block' : ''}">
				<div class="border-b border-black px-2 py-1 bg-red-100 text-xs font-bold font-mono text-red-700">
					[!!] CRITICAL ({data.redAlerts.length})
				</div>
				{#each redGroups as group (group.title)}
					<AlertGroup {group} ackAction="?/ack" />
				{/each}
				{#if data.redAlerts.length === 0}
					<div class="p-2 text-xs text-gray-400">none</div>
				{/if}
			</div>

			<!-- WARNINGS lane -->
			<div class="{data.amberAlerts.length === 0 ? 'hidden lg:block' : ''} border-t lg:border-t-0 border-black">
				<div class="border-b border-black px-2 py-1 bg-amber-100 text-xs font-bold font-mono text-amber-700">
					[!] WARNINGS ({data.amberAlerts.length})
				</div>
				{#each amberGroups as group (group.title)}
					<AlertGroup {group} ackAction="?/ack" />
				{/each}
				{#if data.amberAlerts.length === 0}
					<div class="p-2 text-xs text-gray-400">none</div>
				{/if}
			</div>

			<!-- INFORMATION lane -->
			<div class="{data.infoAlerts.length === 0 ? 'hidden lg:block' : ''} border-t lg:border-t-0 border-black">
				<div class="border-b border-black px-2 py-1 bg-gray-100 text-xs font-bold font-mono text-zinc-500">
					[i] INFORMATION ({data.infoAlerts.length})
				</div>
				{#each infoGroups as group (group.title)}
					<AlertGroup {group} ackAction="?/ack" />
				{/each}
				{#if data.infoAlerts.length === 0}
					<div class="p-2 text-xs text-gray-400">none</div>
				{/if}
			</div>
		</div>

	{/if}

	{#if data.acknowledged.length > 0}
		<button
			type="button"
			class="w-full border-b border-black px-2 py-1 bg-gray-50 text-xs font-bold font-mono text-zinc-400 flex justify-between items-center cursor-pointer"
			onclick={() => (showAcked = !showAcked)}
		>
			<span>[x] ACKNOWLEDGED ({data.acknowledged.length}) — hidden from all pages</span>
			<span>{showAcked ? '[-]' : '[+]'}</span>
		</button>
		{#if showAcked}
			{#each ackedGroups as group (group.title)}
				<AlertGroup {group} restoreAction="?/restore" />
			{/each}
		{/if}
	{/if}
</div>
