<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, action }: {
		title: string;
		action?: Snippet;
	} = $props();
</script>

<!-- v3 R-H10: semantic heading — section title bands are h2s (a11y tree
     gains structure; visual output unchanged) -->
<h2 class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2 m-0 text-sm">
	<span>{title}</span>
	{#if action}
		{@render action()}
	{/if}
</h2>
