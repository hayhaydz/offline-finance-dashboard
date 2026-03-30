<script lang="ts">
	import type { Alert } from '$lib/types/alerts';
	const { alert }: { alert: Alert } = $props();
</script>

<div class="border-b border-black flex justify-between items-start px-2 py-1 text-sm font-mono
  {alert.severity === 'red' ? 'bg-red-50' : alert.severity === 'amber' ? 'bg-amber-50' : 'bg-white'}">
	<div class="flex gap-2">
		<span class="font-bold shrink-0
      {alert.severity === 'red' ? 'text-red-700' : alert.severity === 'amber' ? 'text-amber-700' : 'text-zinc-500'}">
			{alert.severity === 'red' ? '[!!]' : alert.severity === 'amber' ? '[!]' : '[i]'}
		</span>
		<div>
			<span class="font-bold">{alert.title}</span>
			<span class="text-zinc-600 ml-2">{alert.message}</span>
			{#if alert.accountName}
				<span class="text-zinc-400 ml-2 text-xs">— {alert.accountName}</span>
			{/if}
		</div>
	</div>
	{#if alert.href}
		<a href={alert.href} class="bracket-link shrink-0 text-xs ml-4">View</a>
	{/if}
</div>
