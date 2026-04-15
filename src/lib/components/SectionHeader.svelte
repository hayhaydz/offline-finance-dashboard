<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, action }: {
		title: string;
		action?: Snippet;
	} = $props();
</script>

<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
	<span>{title}</span>
	{#if action}
		{@render action()}
	{/if}
</div>
