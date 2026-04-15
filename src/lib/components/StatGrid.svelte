<script lang="ts">
	import type { Snippet } from 'svelte';
	let { cols = 4, children }: { cols?: number; children: Snippet } = $props();
	const colClass: Record<number, string> = {
		2: 'grid-cols-1 md:grid-cols-2',
		3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
		4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
		5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-5',
	};
</script>

<div class="grid {colClass[cols] ?? colClass[4]}">
	{@render children()}
</div>
