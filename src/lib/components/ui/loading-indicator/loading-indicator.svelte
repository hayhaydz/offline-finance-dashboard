<script lang="ts">
	import { loading } from '$lib/stores/loading';

	let { message = '', show = false } = $props();

	// Use local show prop if provided, otherwise use global loading state
	const shouldShow = $derived(show !== undefined ? show : loading.state);
	const displayMessage = $derived(message || loading.message);
</script>

{#if shouldShow}
	<div class="border-b border-black p-2 bg-gray-50">
		<div class="flex items-center gap-2">
			<span class="font-bold text-xs">PROCESSING</span>
			{#if displayMessage}
				<span class="text-gray-600 text-xs">{displayMessage}</span>
			{/if}
		</div>
		<!-- Simple animated loading indicator -->
		<div class="flex gap-1 mt-1">
			<span class="animate-pulse text-xs">■</span>
			<span class="animate-pulse text-xs" style="animation-delay: 0.1s">■</span>
			<span class="animate-pulse text-xs" style="animation-delay: 0.2s">■</span>
		</div>
	</div>
{/if}

<style>
	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.animate-pulse {
		animation: pulse 1s ease-in-out infinite;
	}
</style>
