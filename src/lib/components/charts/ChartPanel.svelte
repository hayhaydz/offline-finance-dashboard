<script lang="ts">
	import type { Snippet } from 'svelte';
	import { exportChartPng, exportChartSvg } from '$lib/utils/chart-export';

	/**
	 * ChartPanel (Phase 4 foundation, Variant B): the bordered frame every
	 * chart lives in. Terminal aesthetic — 1px black border, gray title
	 * band, and a MANDATORY plain-text summary under the chart so every
	 * visualization carries its own accessible description (screen-reader
	 * users get the trend without the SVG; sighted users get the numbers).
	 *
	 * Phase 5 line 3: every panel carries [SVG] / [PNG] export buttons in
	 * the title band (hidden in print) when it contains an SVG.
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

	let panelEl: HTMLElement | null = $state(null);

	function onExportSvg() {
		if (panelEl) exportChartSvg(panelEl, title);
	}

	async function onExportPng() {
		if (panelEl) await exportChartPng(panelEl, title);
	}
</script>

<figure class="chart-panel m-0" bind:this={panelEl}>
	<figcaption class="chart-panel-title">
		<span>{title}</span>
		<span class="flex items-center gap-1">
			{#if controls}
				{@render controls()}
			{/if}
			<span class="no-print flex gap-1">
				<button
					type="button"
					class="bracket-link text-[10px]"
					title="Download this chart as SVG"
					onclick={onExportSvg}>[SVG]</button
				>
				<button
					type="button"
					class="bracket-link text-[10px]"
					title="Download this chart as PNG"
					onclick={onExportPng}>[PNG]</button
				>
			</span>
		</span>
	</figcaption>
	<div class="p-2">{#if children}{@render children()}{/if}</div>
	<div class="chart-panel-summary">{summary}</div>
</figure>
