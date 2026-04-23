<script lang="ts">
	import { sessionTimer } from '$lib/utils/session-timer.svelte';
	import type { Phase } from '$lib/utils/session-timer.svelte';

	const phase = $derived(sessionTimer.phase);
	const seconds = $derived(sessionTimer.secondsRemaining);

	const visible = $derived(phase !== 'active');

	function formatCountdown(totalSeconds: number): string {
		const m = Math.floor(totalSeconds / 60);
		const s = totalSeconds % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	const bgClass = $derived.by((): string => {
		switch (phase) {
			case 'warning':
				return 'bg-amber-100 border-amber-300';
			case 'urgent':
				return 'bg-red-100 border-red-300';
			case 'expired':
				return 'bg-red-200 border-red-400';
			default:
				return '';
		}
	});

	const textClass = $derived.by((): string => {
		switch (phase) {
			case 'warning':
				return 'text-amber-800';
			case 'urgent':
				return 'text-red-800';
			case 'expired':
				return 'text-red-900';
			default:
				return '';
		}
	});
</script>

{#if visible}
	<div class="border-b px-2 py-1.5 text-sm font-mono {bgClass} {textClass}">
		<div class="flex justify-between items-center">
			{#if phase === 'expired'}
				<span>Logging out...</span>
			{:else if phase === 'urgent'}
				<span>Session expiring in {formatCountdown(seconds)}</span>
			{:else}
				<span>Session will expire due to inactivity</span>
			{/if}

			{#if phase !== 'expired'}
				<button
					type="button"
					onclick={() => sessionTimer.reset()}
					class="bracket-link text-xs"
				>
					Continue session
				</button>
			{/if}
		</div>
	</div>
{/if}
