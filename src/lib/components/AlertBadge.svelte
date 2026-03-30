<script lang="ts">
	import type { Alert } from '$lib/types/alerts';

	const { alert }: { alert: Alert } = $props();

	let expanded = $state(false);

	const directionIcon = $derived(
		alert.type === 'RATE_INCREASED_LIABILITY' ? '↑' :
		alert.type === 'RATE_DECREASED_SAVINGS' ? '↓' : null
	);

	const severityBg     = $derived(alert.severity === 'red' ? 'bg-red-50' : alert.severity === 'amber' ? 'bg-amber-50' : 'bg-white');
	const severityText   = $derived(alert.severity === 'red' ? 'text-red-700' : alert.severity === 'amber' ? 'text-amber-700' : 'text-zinc-500');
	const severityBorder = $derived(alert.severity === 'red' ? 'border-red-200' : alert.severity === 'amber' ? 'border-amber-200' : 'border-black/10');
	const prefix         = $derived(alert.severity === 'red' ? '[!!]' : alert.severity === 'amber' ? '[!]' : '[i]');

	// Human-readable account type label for collapsed context
	const typeLabel = $derived(() => {
		if (!alert.accountType) return null;
		const labels: Record<string, string> = {
			'savings':     'SAVINGS',
			'current':     'CURRENT',
			'investment':  'INVESTMENT',
			'credit-card': 'CREDIT CARD',
			'loan':        'LOAN',
			'mortgage':    'MORTGAGE',
		};
		return labels[alert.accountType] ?? alert.accountType.toUpperCase();
	});
</script>

<div class="border-b border-black font-mono text-sm {severityBg}">
	<!-- Header row — always visible, click to expand -->
	<button
		type="button"
		class="w-full flex justify-between items-center px-2 py-1 text-left cursor-pointer"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex gap-2 items-center min-w-0">
			<span class="font-bold shrink-0 {severityText}">{prefix}</span>
			<span class="font-bold">
				{#if directionIcon}
					<span class="{severityText} mr-0.5">{directionIcon}</span>
				{/if}
				{alert.title}
			</span>
			{#if typeLabel()}
				<span class="text-xs border border-current px-1 shrink-0 {alert.accountCategory === 'liability' ? 'text-red-600 border-red-300' : 'text-zinc-500 border-zinc-300'}">{typeLabel()}</span>
			{/if}
			{#if alert.accountName}
				<span class="text-zinc-400 text-xs truncate">— {alert.accountName}</span>
			{/if}
		</div>
		<span class="text-xs text-zinc-400 shrink-0 ml-2">{expanded ? '[-]' : '[+]'}</span>
	</button>

	<!-- Expanded detail row -->
	{#if expanded}
		<div class="px-2 pb-2 pt-1 border-t {severityBorder} flex justify-between items-start gap-4">
			<span class="text-zinc-600 text-xs leading-relaxed">{alert.message}</span>
			{#if alert.href}
				<a
					href={alert.href}
					class="bracket-link text-xs shrink-0"
					onclick={(e) => e.stopPropagation()}
				>[View]</a>
			{/if}
		</div>
	{/if}
</div>
