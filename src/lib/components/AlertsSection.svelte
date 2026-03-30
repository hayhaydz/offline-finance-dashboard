<script lang="ts">
	import type { Alert } from '$lib/types/alerts';
	import { sortAlerts, groupAlertsByTitle } from '$lib/types/alerts';
	import AlertGroup from './AlertGroup.svelte';

	const {
		alerts,
		title = 'ALERTS',
		maxItems = undefined,
		viewAllHref = undefined,
	}: {
		alerts: Alert[];
		title?: string;
		maxItems?: number;
		viewAllHref?: string;
	} = $props();

	let open = $state(true);
	const sorted = $derived(sortAlerts(alerts));
	const groups = $derived(groupAlertsByTitle(sorted));
	// maxItems applies to the number of groups shown, not raw alerts
	const visible = $derived(maxItems ? groups.slice(0, maxItems) : groups);
	const truncated = $derived(maxItems ? Math.max(0, groups.length - maxItems) : 0);
	const redCount = $derived(alerts.filter((a) => a.severity === 'red').length);
	const amberCount = $derived(alerts.filter((a) => a.severity === 'amber').length);
</script>

{#if alerts.length > 0}
	<div>
		<button
			class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1.5 text-sm bg-white border-b border-black"
			onclick={() => (open = !open)}
		>
			<span class="flex items-center gap-2">
				{title} ({alerts.length})
				{#if redCount > 0}
					<span class="text-red-700 text-xs">[!!{redCount}]</span>
				{/if}
				{#if amberCount > 0}
					<span class="text-amber-700 text-xs">[!{amberCount}]</span>
				{/if}
			</span>
			<span class="text-xs text-zinc-400">{open ? '[-]' : '[+]'}</span>
		</button>
		{#if open}
			{#each visible as group (group.title)}
				<AlertGroup {group} />
			{/each}
			{#if truncated > 0 && viewAllHref}
				<div class="px-2 py-1 text-xs text-zinc-500 flex justify-between border-b border-black">
					<span>+{truncated} more alert type{truncated > 1 ? 's' : ''}</span>
					<a href={viewAllHref} class="bracket-link">View All</a>
				</div>
			{/if}
		{/if}
	</div>
{/if}
