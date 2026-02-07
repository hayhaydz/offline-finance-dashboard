<script lang="ts">
	let { show = false, message = '' } = $props();
</script>

{#if show}
	<div class="border-b border-black p-2 bg-gray-50">
		<div class="flex items-center gap-2">
			<span class="font-bold text-xs">PROCESSING</span>
			{#if message}
				<span class="text-gray-600 text-xs">{message}</span>
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
