<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Alert } from '$lib/types/alerts';

	let {
		alert,
		ackAction,
		restoreAction
	}: {
		alert: Alert;
		/** Form action for acknowledge (e.g. '?/ack'); absent = no ack UI (proposal #10) */
		ackAction?: string;
		/** Form action for restore (e.g. '?/restore') */
		restoreAction?: string;
	} = $props();

	let expanded = $state(false);

	const directionIcon = $derived(
		alert.type === 'RATE_INCREASED_LIABILITY' ? '↑' :
		alert.type === 'RATE_DECREASED_SAVINGS' ? '↓' : null
	);

	const severityBg     = $derived(alert.severity === 'red' ? 'bg-red-50' : alert.severity === 'amber' ? 'bg-amber-50' : 'bg-white');
	const severityText   = $derived(alert.severity === 'red' ? 'text-red-700' : alert.severity === 'amber' ? 'text-amber-700' : 'text-zinc-500');
	const severityBorder = $derived(alert.severity === 'red' ? 'border-red-200' : alert.severity === 'amber' ? 'border-amber-200' : 'border-black/10');
	const prefix         = $derived(alert.severity === 'red' ? '[!!]' : alert.severity === 'amber' ? '[!]' : '[i]');

	const isAcked = $derived(alert.acknowledgedUntil !== undefined);

	// Human-readable account type label for collapsed context
	const typeLabel = $derived.by(() => {
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

	// Sentinel: anything on/after 2100-01-01 (4102444800000 ms) is a "Done" ack
	const ACK_DONE_SENTINEL_MS = 4_102_444_800_000;
	const ackedUntilLabel = $derived.by(() => {
		if (alert.acknowledgedUntil === undefined) return null;
		if (alert.acknowledgedUntil >= ACK_DONE_SENTINEL_MS) return 'hidden until restored';
		return `snoozed until ${new Date(alert.acknowledgedUntil).toISOString().slice(0, 10)}`;
	});

	const invalidate = () => async () => {
		await invalidateAll();
	};
</script>

<div class="border-b border-black font-mono text-sm {severityBg}" class:opacity-60={isAcked}>
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
			{#if typeLabel}
				<span class="text-xs border border-current px-1 shrink-0 {alert.accountCategory === 'liability' ? 'text-red-600 border-red-300' : 'text-zinc-500 border-zinc-300'}">{typeLabel}</span>
			{/if}
			{#if alert.accountName}
				<span class="text-zinc-400 text-xs truncate">— {alert.accountName}</span>
			{/if}
			{#if isAcked}
				<span class="text-[10px] text-zinc-400 border border-zinc-300 px-1 shrink-0">ACKED</span>
			{/if}
		</div>
		<span class="text-xs text-zinc-400 shrink-0 ml-2">{expanded ? '[-]' : '[+]'}</span>
	</button>

	<!-- Expanded detail row -->
	{#if expanded}
		<div class="px-2 pb-2 pt-1 border-t {severityBorder} flex justify-between items-start gap-4">
			<div class="min-w-0">
				<span class="text-zinc-600 text-xs leading-relaxed">{alert.message}</span>
				{#if ackedUntilLabel}
					<div class="text-[10px] text-zinc-400 mt-0.5">{ackedUntilLabel}</div>
				{/if}
			</div>
			<div class="flex gap-2 shrink-0">
				{#if alert.href}
					<a
						href={alert.href}
						class="bracket-link text-xs"
						onclick={(e) => e.stopPropagation()}
					>[View]</a>
				{/if}
				{#if alert.secondaryHref}
					<a
						href={alert.secondaryHref}
						class="bracket-link text-xs"
						title="Counterpart account"
						onclick={(e) => e.stopPropagation()}
					>[{alert.secondaryLabel ?? 'View'}]</a>
				{/if}
				{#if ackAction && !isAcked}
					<form method="POST" action={ackAction} use:enhance={invalidate} class="inline">
						<input type="hidden" name="alertId" value={alert.id} />
						<button type="submit" name="mode" value="done" class="bracket-link text-xs">[Done]</button>
					</form>
					<form method="POST" action={ackAction} use:enhance={invalidate} class="inline">
						<input type="hidden" name="alertId" value={alert.id} />
						<button type="submit" name="mode" value="snooze30" class="bracket-link text-xs">[Snooze 30d]</button>
					</form>
				{/if}
				{#if restoreAction && isAcked}
					<form method="POST" action={restoreAction} use:enhance={invalidate} class="inline">
						<input type="hidden" name="alertId" value={alert.id} />
						<button type="submit" class="bracket-link text-xs">[Restore]</button>
					</form>
				{/if}
			</div>
		</div>
	{/if}
</div>
