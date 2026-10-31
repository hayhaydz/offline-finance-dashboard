<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { allocationShares } from "$lib/utils/surface-views";

	/**
	 * AllocationStrip — v3.1 second-mandate redesign (2026-10-31).
	 * The old ink-bar sliver (unreadable 2% segments) and the h-bar
	 * chart ("looks bad… same as another graph" — user) are replaced by
	 * a CRAFTED composition strip for "where the money sits" surfaces:
	 * one full-width band, segments ordered largest-first with direct
	 * in-segment labels where they fit, a sorted legend with £ + % for
	 * every share, a live hover detail panel, and a per-segment drill
	 * link (goals/asset detail). Ranked per-goal bars live on /goals —
	 * different shape, different job (see AllocationBar).
	 */
	let {
		items,
		label = "allocated",
		noun = "goals",
		hrefFor,
		controls,
	}: {
		items: Array<{ name: string; value: number }>;
		label?: string;
		/** what the shares are (goals, asset classes, …) — used in the summary */
		noun?: string;
		/** optional per-segment drill link (name → href) */
		hrefFor?: (name: string) => string;
		/** optional controls forwarded into the ChartPanel title band */
		controls?: import('svelte').Snippet;
	} = $props();

	const shares = $derived(allocationShares(items));
	const total = $derived(items.reduce((s, i) => s + Math.max(0, i.value), 0));

	// ink density with alternating contrast (v3.1 A13: adjacent first-two
	// shades were near-identical — a 3% sliver between them vanished)
	const SEG_BG = ["#111827", "#6b7280", "#374151", "#9ca3af", "#4b5563", "#d1d5db", "#e5e7eb"];
	const bg = (i: number) => SEG_BG[i % SEG_BG.length];

	let hoverIdx: number | null = $state(null);

	const summary = $derived(
		shares.length === 0
			? `No ${label} money yet`
			: `${formatCurrency(total)} ${label} across ${shares.length} ${noun} — largest: ${shares[0].name} (${shares[0].percent}%)`,
	);

	// a segment gets an inline label when it's wide enough to hold it
	const labelled = (percent: number) => percent >= 12;
</script>

<ChartPanel title="Allocation — where the money sits" {summary} {controls}>
	{#if shares.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no {label} money]</div>
	{:else}
		<div class="p-2">
			<!-- the composition band -->
			<div
				class="flex h-9 border border-black w-full overflow-hidden"
				role="img"
				aria-label="Allocation composition. {summary}"
			>
				{#each shares as s, i (s.name)}
					{#if s.percent > 0}
						<button
							type="button"
							class="h-full flex items-center justify-center overflow-hidden whitespace-nowrap cursor-pointer transition-all duration-150
								{hoverIdx === i ? 'ring-2 ring-inset ring-white' : ''} {bg(i) === '#111827' || bg(i) === '#374151' || bg(i) === '#4b5563' ? 'text-white' : 'text-black'}"
							style="width: {s.percent}%; background: {bg(i)};"
							aria-label="{s.name}: {formatCurrency(s.value)} ({s.percent}%)"
							onmouseenter={() => (hoverIdx = i)}
							onmouseleave={() => (hoverIdx = null)}
							onfocus={() => (hoverIdx = i)}
							onblur={() => (hoverIdx = null)}
						>
							{#if labelled(s.percent)}
								<span class="text-[10px] font-bold px-1 truncate">{s.name}</span>
							{/if}
						</button>
					{/if}
				{/each}
			</div>

			<!-- hover detail panel -->
			<div class="text-xs tabular-nums min-h-5 mt-1.5" aria-live="polite">
				{#if hoverIdx !== null}
					{@const s = shares[hoverIdx]}
					<span class="font-bold">{s.name}</span>
					<span class="ml-2">{formatCurrency(s.value)}</span>
					<span class="text-gray-500"> · {s.percent}% of {label}</span>
					{#if hrefFor}
						<a href={hrefFor(s.name)} class="bracket-link ml-2">Open</a>
					{/if}
				{:else}
					<span class="text-gray-500">hover a segment for detail</span>
				{/if}
			</div>

			<!-- sorted legend: every share, £ + %, swatch tied to the band -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5 mt-1.5 border-t border-gray-200 pt-1.5">
				{#each shares as s, i (s.name)}
					<div
						role="presentation"
						class="flex items-center gap-1.5 text-[10px] leading-5 cursor-default {hoverIdx === i ? 'bg-gray-100 -mx-1 px-1' : ''}"
						onmouseenter={() => (hoverIdx = i)}
						onmouseleave={() => (hoverIdx = null)}
					>
						<div class="w-3 h-3 shrink-0 border border-gray-400" style="background: {bg(i)}"></div>
						<span class="flex-1 min-w-0 truncate" title={s.name}>{s.name}</span>
						<span class="tabular-nums text-gray-600 shrink-0">{formatCurrency(s.value)}</span>
						<span class="tabular-nums font-bold w-8 text-right shrink-0">{s.percent}%</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</ChartPanel>
