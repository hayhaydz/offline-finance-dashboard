<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { errorDisplayMessage } from '$lib/utils/error-display';

	let error = $derived(page.error);
	// Reactive so SSR shows the real message on first paint, not just
	// post-hydration (page.error is a plain { message } object — P0-3)
	let displayMessage = $derived(errorDisplayMessage(error));
	// page.status is undefined in SSR-test mocks — default to the
	// generic-error branch rather than 404
	let status = $derived(page.status ?? 500);
	let is404 = $derived(status === 404);
	let errorDetails = $state<{
		stack?: string;
		timestamp: string;
		url: string;
	}>({
		timestamp: new Date().toISOString(),
		url: page.url.href
	});

	onMount(() => {
		// Log error to console for browser DevTools
		console.error('[Client Error]', error);

		// Store error details for display
		errorDetails = {
			stack: error instanceof Error ? error.stack : undefined,
			timestamp: new Date().toISOString(),
			url: page.url.href
		};
	});

	// Contextual way back for registry 404s ("No such tool/report") —
	// generic [Go Home] works, but the index link is what the user wants
	const contextualBack = $derived.by(() => {
		const p = page.url.pathname;
		if (p.startsWith("/tools")) return { href: "/tools", label: "All Tools" };
		if (p.startsWith("/overview/reports")) return { href: "/overview/reports", label: "All Reports" };
		if (p.startsWith("/overview/snapshots")) return { href: "/overview/snapshots", label: "All Snapshots" };
		if (p.startsWith("/accounts")) return { href: "/accounts", label: "All Accounts" };
		if (p.startsWith("/goals")) return { href: "/goals", label: "All Goals" };
		return null;
	});

	// Function to reload the page
	function reload() {
		window.location.reload();
	}

	// Function to go home
	function goHome() {
		window.location.href = '/';
	}
</script>

<!-- v3.2 sweep 29: boxed panel (D9 — full-bleed border-b bands were the
     banned pattern this page still used) + status-aware honest copy:
     a missing page/record says 404, not "unexpected error" -->
<div class="border border-black max-w-3xl">
	<div class="border-b border-black px-2 py-1 flex items-baseline justify-between gap-2">
		<h1 class="text-lg font-bold m-0">{is404 ? '404 — NOT FOUND' : `ERROR — ${status}`}</h1>
		<span class="text-xs text-gray-600 whitespace-nowrap">{page.url.pathname}</span>
	</div>

	<div class="p-2">
		{#if is404}
			<p class="mb-2">The page or record you requested does not exist.</p>
			<p class="mb-2 text-xs text-gray-600">
				It may have been renamed or removed. Declared data is unaffected.
			</p>
		{:else}
			<h2 class="text-red-700 font-bold mb-2">An Unexpected Error Occurred</h2>

			<div class="mb-2">
				<p class="mb-1"><strong>Message:</strong> {displayMessage}</p>
			</div>
		{/if}

		<p class="mb-2 text-xs text-gray-600">
			<strong>URL:</strong> {errorDetails.url} · <strong>Time:</strong> {new Date(errorDetails.timestamp).toLocaleString()}
		</p>

		{#if errorDetails.stack && import.meta.env.DEV}
			<div class="mb-2 p-2 bg-gray-100 border border-black">
				<h3 class="font-bold mb-1">Stack Trace (Development Only)</h3>
				<pre class="text-xs overflow-x-auto">{errorDetails.stack}</pre>
			</div>
		{/if}

		<div class="flex gap-2">
			{#if contextualBack}
				<a href={contextualBack.href} class="bracket-link">
					{contextualBack.label}
				</a>
			{/if}
			{#if !is404}
				<button onclick={reload} class="bracket-link">
					Reload Page
				</button>
			{/if}
			<button onclick={goHome} class="bracket-link">
				Go Home
			</button>
		</div>

		{#if !is404}
			<div class="mt-2 text-xs text-gray-600">
				<p>If this error persists, please check the browser console for more details or contact support.</p>
			</div>
		{/if}
	</div>
</div>
