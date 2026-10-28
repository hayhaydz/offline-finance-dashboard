<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * ChartPanel (Phase 4 foundation, Variant B): the bordered frame every
	 * chart lives in. Terminal aesthetic — 1px black border, gray title
	 * band, and a MANDATORY plain-text summary under the chart so every
	 * visualization carries its own accessible description (screen-reader
	 * users get the trend without the SVG; sighted users get the numbers).
	 */
	let {
		title,
		/** Plain-text trend summary rendered under the chart (a11y). */
		summary,
		/** Optional controls (range pickers, toggles) in the title band. */
		controls,
		children,
	}: {
		title: string;
		summary: string;
		controls?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<figure class="chart-panel m-0">
	<figcaption class="chart-panel-title">
		<span>{title}</span>
		{#if controls}
			{@render controls()}
		{/if}
	</figcaption>
	<div class="p-2">{#if children}{@render children()}{/if}</div>
	<div class="chart-panel-summary">{summary}</div>
</figure>
