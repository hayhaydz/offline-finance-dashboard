<script lang="ts">
	import { goto } from '$app/navigation';
	import { sessionTimer } from '$lib/utils/session-timer.svelte';
	import type { Phase } from '$lib/utils/session-timer.svelte';

	const phase = $derived(sessionTimer.phase);
	const seconds = $derived(sessionTimer.secondsRemaining);

	const visible = $derived(phase !== 'active');
	// Live countdown during the final 60 seconds of the warning window.
	const showCountdown = $derived(phase === 'urgent' || (phase === 'warning' && seconds <= 60));

	function formatCountdown(totalSeconds: number): string {
		const m = Math.floor(totalSeconds / 60);
		const s = totalSeconds % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	async function staySignedIn() {
		// reset() records local activity + re-arms the client timer; the
		// ping refreshes the server-side lastActivity (enforcement clock).
		sessionTimer.reset();
		try {
			await fetch('/api/session-ping', { method: 'POST' });
		} catch {
			// Server unreachable — the local timer is still extended.
		}
	}

	async function logoutNow() {
		sessionTimer.stop();
		try {
			await fetch('/api/logout', { method: 'POST' });
		} finally {
			goto('/login?reason=logged-out');
		}
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
			{:else if showCountdown}
				<span>Session expiring in {formatCountdown(seconds)}</span>
			{:else}
				<span>Session will expire due to inactivity</span>
			{/if}

			{#if phase !== 'expired'}
				<div class="flex gap-2">
					<button type="button" onclick={staySignedIn} class="bracket-link text-xs">
						Stay signed in
					</button>
					<button type="button" onclick={logoutNow} class="bracket-link text-xs">
						Log out
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
