<script lang="ts">
	import Navigation from '$lib/components/navigation.svelte';
	import SessionBanner from '$lib/components/SessionBanner.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import HelpOverlay from '$lib/components/HelpOverlay.svelte';
	import { sessionTimer } from '$lib/utils/session-timer.svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { documentTitle } from '$lib/utils/page-title';
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

<!-- v3 R-H13: per-page document titles (lighthouse document-title audit) -->
<svelte:head>
	<title>{documentTitle(page.url.pathname)}</title>
</svelte:head>

<div class="app-shell border border-black max-w-none mx-0 w-full h-[calc(100vh-1rem)] flex flex-col overflow-hidden">
	<!-- skip link: first tab stop, visible only on keyboard focus -->
	<a href="#main-content" class="skip-link bracket-link text-xs">Skip to content</a>
	<!-- v3 R16-class fix: text WITHOUT literal brackets — bracket-link CSS supplies them (was rendering [[Skip to content]]) -->
	{#if user}
		<!-- .no-print: chrome strip stays on screen only (print/PDF rule) -->
		<!-- v3.1 A01 craft: · delimiters rank the status run (identity ·
		     session · mode · state) — flat equal gaps read as one
		     undifferentiated string at 1600px -->
		<div class="bg-black text-white p-1 font-bold text-xs flex items-center gap-4 no-print">
			<span class="flex-none">OFFLINE-FINANCE-v0.exe</span>
			<span class="flex-1 min-w-0 flex items-center gap-2">
				<span class="text-gray-500 select-none" aria-hidden="true">·</span>
				<span>USER: {user.username.toUpperCase()}</span>
				<span class="text-gray-500 select-none" aria-hidden="true">·</span>
				<span>{modeIndicator}</span>
				{#if !environment.isProduction}
					<span class="text-gray-500 select-none" aria-hidden="true">·</span>
					<span class="text-amber-400">[!] DEV DATA [!]</span>
				{/if}
			</span>
			<div class="flex-none flex items-center gap-1">
				<button
					type="button"
					class="bracket-link text-xs text-white"
					onclick={() => (paletteOpen = true)}
					title="Open command palette (⌘K)"
				>
					⌘K
				</button>
				<button
					type="button"
					class="bracket-link text-xs text-white"
					onclick={() => (helpOpen = !helpOpen)}
					title="Keyboard shortcuts (?)"
				>
					?
				</button>
			</div>
		</div>

		<SessionBanner />
		<CommandPalette bind:open={paletteOpen} onHelp={() => (helpOpen = true)} />
		<HelpOverlay bind:open={helpOpen} />
	{/if}

	<Navigation {user} {environment} breadcrumbOverrides={breadcrumbOverrides} />

	<main id="main-content" class="scrollable-content flex-1 min-h-0" bind:this={scrollContainer}>
		{@render children()}
		<!-- v3.1 A01: the EOF line — the internal-scroll window ends content
		     mid-frame on short pages and read as "broken" in 6+ vision
		     rounds; terminal convention marks document end (less/man/vim) -->
		<div class="no-print select-none border-t border-gray-200 py-1 text-center text-[9px] tracking-[0.5em] text-gray-600" aria-hidden="true">
			EOF
		</div>
	</main>
</div>
