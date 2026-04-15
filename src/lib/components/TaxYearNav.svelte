<script lang="ts">
	type YearEntry = { slug: string };
	let { availableYears, currentSlug, basePath, label = 'Tax Year' }: {
		availableYears: YearEntry[];
		currentSlug: string;
		basePath: string;
		label?: string;
	} = $props();

	const currentIndex = $derived(availableYears.findIndex(y => y.slug === currentSlug));
	const prevYear = $derived(currentIndex > 0 ? availableYears[currentIndex - 1] : null);
	const nextYear = $derived(currentIndex < availableYears.length - 1 ? availableYears[currentIndex + 1] : null);
</script>

<div class="text-[10px] uppercase font-bold text-gray-600">{label}</div>
<div class="flex gap-1 items-center">
	{#if prevYear}
		<a href="{basePath}/{prevYear.slug}" class="bracket-link text-xs" data-sveltekit-noscroll>[Prev]</a>
	{/if}
	<span class="bracket-link bg-black text-white text-xs px-1">{currentSlug}</span>
	{#if nextYear}
		<a href="{basePath}/{nextYear.slug}" class="bracket-link text-xs" data-sveltekit-noscroll>[Next]</a>
	{/if}
</div>
