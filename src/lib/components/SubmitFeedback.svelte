<script lang="ts">
	let {
		message,
		onDismiss
	}: {
		message: { type: 'success' | 'error'; text: string } | null;
		onDismiss: () => void;
	} = $props();
</script>

{#if message}
	<div
		class="p-2 border-t text-sm flex justify-between items-start
			{message.type === 'error' ? 'bg-red-100' : 'bg-green-100'}"
	>
		<div class="flex-1">
			{@html message.text.replace(
				/\[(.*?)\]\((.*?)\)/g,
				'<a href="$2" class="bracket-link text-xs">$1</a>'
			)}
		</div>
		<button type="button" onclick={onDismiss} class="ml-2 text-xs bracket-link">
			[Dismiss]
		</button>
	</div>
{/if}
