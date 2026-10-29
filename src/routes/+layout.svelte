<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import SessionBanner from '$lib/components/SessionBanner.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import HelpOverlay from '$lib/components/HelpOverlay.svelte';
	import { sessionTimer } from '$lib/utils/session-timer.svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	const user = $derived(page.data.user ?? null);
	const environment = $derived(page.data.environment ?? { mode: 'unknown', isProduction: false, hasEncryption: false });
	const breadcrumbOverrides = $derived(page.data.breadcrumbOverrides);

	// Environment mode indicator
	const modeIndicator = $derived(
		environment.isProduction
			? '[ MODE: SECURE ]'
			: environment.hasEncryption
				? '[ MODE: LOOSE / ENCRYPTED ]'
				: '[ MODE: LOOSE / UNENCRYPTED ]'
	);

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	let scrollContainer = $state<HTMLElement | null>(null);

	// ⌘K command palette (#19) — authed users only
	let paletteOpen = $state(false);
	let helpOpen = $state(false);

	// Start/stop the session inactivity timer based on auth state.
	// IMPORTANT: the timer reads the LAYOUT's own `data` prop, NOT
	// page.data — several page loads (/, /accounts, /goals, ...) return
	// their own `user` key without inactivityTimeout, which shadowed the
	// layout's user in the merged page.data and silently destroyed the
	// timer on those pages (audit qa-findings/03 never-fire root cause).
	// ensureStarted is idempotent: invalidations that refresh the layout
	// data with the same timeout value must NOT reset the idle deadline.
	$effect(() => {
		if (data.user && typeof data.user.inactivityTimeout === 'number') {
			sessionTimer.ensureStarted(data.user.inactivityTimeout);
		} else {
			sessionTimer.destroy();
		}
	});

	afterNavigate(() => {
		scrollContainer?.scrollTo({ top: 0 });
	});
</script>

<div class="border border-black max-w-4xl mx-auto w-full">
	{#if user}
		<!-- .no-print: chrome strip stays on screen only (print/PDF rule) -->
		<div class="bg-black text-white p-1 font-bold text-xs flex justify-between no-print">
			<span>OFFLINE-FINANCE-v0.exe</span>
			<span>USER: {user.username.toUpperCase()}</span>
			<span>{modeIndicator}</span>
			{#if !environment.isProduction}
				<span class="text-amber-400">[!] DEV DATA [!]</span>
			{/if}
			<button
				type="button"
				class="bracket-link text-xs text-white"
				onclick={() => (paletteOpen = true)}
				title="Open command palette (⌘K)"
			>
				[⌘K]
			</button>
			<button
				type="button"
				class="bracket-link text-xs text-white"
				onclick={() => (helpOpen = !helpOpen)}
				title="Keyboard shortcuts (?)"
			>
				[?]
			</button>
		</div>

		<SessionBanner />
		<CommandPalette bind:open={paletteOpen} onHelp={() => (helpOpen = true)} />
		<HelpOverlay bind:open={helpOpen} />
	{/if}

	<Navigation {user} {environment} breadcrumbOverrides={breadcrumbOverrides} />

	<div class="scrollable-content" bind:this={scrollContainer}>
		{@render children()}
	</div>
</div>
