<script lang="ts">
	let {
		page = $bindable(),
		totalPages
	}: {
		page: number;
		totalPages: number;
	} = $props();

	const pages = $derived.by((): (number | '...')[] => {
		const range: (number | '...')[] = [];
		let last = -1;
		for (let i = 0; i < totalPages; i++) {
			if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
				if (last !== -1 && i - last > 1) range.push('...');
				range.push(i);
				last = i;
			}
		}
		return range;
	});
</script>

{#if totalPages > 1}
	<div class="border-t border-black p-2 flex gap-2 items-center text-sm">
		{#if page > 0}
			<button type="button" onclick={() => page -= 1} class="bracket-link">[Prev]</button>
		{/if}
		{#each pages as p}
			{#if p === '...'}
				<span class="text-gray-400">...</span>
			{:else if p === page}
				<span class="font-bold">[{p + 1}]</span>
			{:else}
				<button type="button" onclick={() => page = p} class="bracket-link">{p + 1}</button>
			{/if}
		{/each}
		{#if page < totalPages - 1}
			<button type="button" onclick={() => page += 1} class="bracket-link">[Next]</button>
		{/if}
	</div>
{/if}
