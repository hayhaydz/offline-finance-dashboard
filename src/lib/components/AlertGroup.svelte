<script lang="ts">
	import type { AlertGroup } from '$lib/types/alerts';
	import AlertBadge from './AlertBadge.svelte';

	const { group }: { group: AlertGroup } = $props();

	let expanded = $state(false);

	const directionIcon = $derived(
		group.type === 'RATE_INCREASED_LIABILITY' ? '↑' :
		group.type === 'RATE_DECREASED_SAVINGS' ? '↓' : null
	);

	const severityBg     = $derived(group.severity === 'red' ? 'bg-red-50' : group.severity === 'amber' ? 'bg-amber-50' : 'bg-white');
	const severityText   = $derived(group.severity === 'red' ? 'text-red-700' : group.severity === 'amber' ? 'text-amber-700' : 'text-zinc-500');
	const severityBorder = $derived(group.severity === 'red' ? 'border-red-200' : group.severity === 'amber' ? 'border-amber-200' : 'border-black/10');
	const prefix         = $derived(group.severity === 'red' ? '[!!]' : group.severity === 'amber' ? '[!]' : '[i]');
</script>

{#if group.alerts.length === 1}
	<!-- Single alert — delegate to AlertBadge -->
	<AlertBadge alert={group.alerts[0]} />
{:else}
	<!-- Multiple accounts with the same alert title — grouped row -->
	<div class="border-b border-black font-mono text-sm {severityBg}">
		<button
			type="button"
			class="w-full flex justify-between items-center px-2 py-1 text-left cursor-pointer"
			onclick={() => (expanded = !expanded)}
		>
			<div class="flex gap-2 items-center">
				<span class="font-bold shrink-0 {severityText}">{prefix}</span>
				<span class="font-bold">
					{#if directionIcon}
						<span class="{severityText} mr-0.5">{directionIcon}</span>
					{/if}
					{group.title}
				</span>
				<span class="text-zinc-400 text-xs">({group.alerts.length} accounts)</span>
			</div>
			<span class="text-xs text-zinc-400 shrink-0 ml-2">{expanded ? '[-]' : '[+]'}</span>
		</button>

		{#if expanded}
			<div class="border-t {severityBorder}">
				{#each group.alerts as alert (alert.id)}
					{@const isLiability = alert.accountCategory === 'liability'}
					<div class="flex justify-between items-start px-4 py-1.5 border-b {severityBorder} last:border-b-0">
						<div class="min-w-0 flex items-baseline gap-1.5 flex-wrap">
							{#if alert.accountType}
								{@const typeLabels: Record<string, string> = { 'savings': 'SAVINGS', 'current': 'CURRENT', 'investment': 'INVESTMENT', 'credit-card': 'CREDIT CARD', 'loan': 'LOAN', 'mortgage': 'MORTGAGE' }}
								<span class="text-xs border px-1 shrink-0 {isLiability ? 'text-red-600 border-red-300' : 'text-zinc-500 border-zinc-300'}">{typeLabels[alert.accountType] ?? alert.accountType.toUpperCase()}</span>
							{/if}
							{#if alert.accountName}
								<span class="text-xs font-bold text-zinc-700">{alert.accountName}</span>
								<span class="text-zinc-400 text-xs">—</span>
							{/if}
							<span class="text-zinc-600 text-xs">{alert.message}</span>
						</div>
						{#if alert.href}
							<a href={alert.href} class="bracket-link text-xs shrink-0 ml-4">[View]</a>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
