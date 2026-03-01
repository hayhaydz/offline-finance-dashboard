<script lang="ts">
	let {
		currentPage,
		totalPages,
		buildHref
	}: {
		currentPage: number;
		totalPages: number;
		buildHref: (page: number) => string;
	} = $props();

	const pages = $derived.by((): (number | '...')[] => {
		const range: (number | '...')[] = [];
		let last = -1;
		for (let i = 0; i < totalPages; i++) {
			if (i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 1) {
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
		{#if currentPage > 0}
			<a href={buildHref(currentPage)} class="bracket-link">Prev</a>
		{/if}
		{#each pages as p}
			{#if p === '...'}
				<span class="text-gray-400">...</span>
			{:else if p === currentPage}
				<span class="font-bold">[{p + 1}]</span>
			{:else}
				<a href={buildHref(p + 1)} class="bracket-link">{p + 1}</a>
			{/if}
		{/each}
		{#if currentPage < totalPages - 1}
			<a href={buildHref(currentPage + 2)} class="bracket-link">Next</a>
		{/if}
	</div>
{/if}
