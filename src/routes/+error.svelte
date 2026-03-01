<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let error = $state($page.error);
	let errorDetails = $state<{
		message: string;
		stack?: string;
		timestamp: string;
		url: string;
	}>({
		message: 'An unknown error occurred',
		timestamp: new Date().toISOString(),
		url: $page.url.href
	});

	onMount(() => {
		// Log error to console for browser DevTools
		console.error('[Client Error]', error);

		// Store error details for display
		errorDetails = {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			timestamp: new Date().toISOString(),
			url: $page.url.href
		};
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

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">ERROR</h1>
</div>

<div class="border-b border-black p-2">
	<h2 class="text-red-700 font-bold mb-2">An Unexpected Error Occurred</h2>

	<div class="mb-4">
		<p class="mb-2"><strong>Message:</strong> {errorDetails.message}</p>
		<p class="mb-2"><strong>Time:</strong> {new Date(errorDetails.timestamp).toLocaleString()}</p>
		<p class="mb-2"><strong>URL:</strong> {errorDetails.url}</p>
	</div>

	{#if errorDetails.stack && import.meta.env.DEV}
		<div class="mb-4 p-2 bg-gray-100 border border-black">
			<h3 class="font-bold mb-2">Stack Trace (Development Only)</h3>
			<pre class="text-xs overflow-x-auto">{errorDetails.stack}</pre>
		</div>
	{/if}

	<div class="flex gap-2">
		<button onclick={reload} class="bracket-link">
			Reload Page
		</button>
		<button onclick={goHome} class="bracket-link">
			Go Home
		</button>
	</div>

	<div class="mt-4 text-xs text-gray-600">
		<p>If this error persists, please check the browser console for more details or contact support.</p>
	</div>
</div>
