<script lang="ts">
	import type { GoalTick } from "$lib/utils/goal-milestone-ticks";

	/**
	 * Goal bullet bar (Phase 4 V1 #3, Variant B): the existing bracketed
	 * progress bar, upgraded with milestone ticks — thin vertical marks
	 * crossing the bar at each milestone's position. Achieved ticks are
	 * green, pending gray; every tick carries a title tooltip. Pure CSS
	 * (same language as the ledger bars), print-safe, no client JS.
	 */
	let {
		percent,
		bgClass,
		ticks = [],
		archived = false,
	}: {
		percent: number;
		/** tailwind bg class for the fill, e.g. bg-green-700 */
		bgClass: string;
		ticks?: GoalTick[];
		archived?: boolean;
	} = $props();

	const clamped = $derived(Math.min(100, Math.max(0, percent)));
// one-decimal tick positions (debt ratios are raw floats — 33.333…% reads badly)
const pctLabel = (pct: number) => `${Math.round(pct * 10) / 10}%`;
</script>

<span>[</span>
<div class="flex-1 h-3 relative border-y border-gray-100">
	<div
		class="h-full {archived ? 'bg-gray-400' : bgClass}"
		style="width: {clamped}%"
	></div>
	{#each ticks as tick (tick.label)}
		{@const status = tick.achieved ? "reached" : "pending"}
		{@const tickClass = tick.achieved ? "bg-green-700" : "bg-gray-400"}
		{@const tickLeft = Math.min(100, Math.max(0, tick.pct))}
		<span
			class="absolute -top-[3px] -bottom-[3px] w-[2px] {tickClass}"
			style="left: {tickLeft}%"
			title="{tick.label} — {status} ({pctLabel(tick.pct)})"
			aria-hidden="true"
		></span>
	{/each}
</div>
<span>]</span>
{#if ticks.length > 0 && !archived}
	<!-- tick legend (Phase 9 polish): explains the milestone marks -->
	<span class="text-[10px] text-gray-500 whitespace-nowrap">
		<span class="inline-block w-[2px] h-2.5 bg-green-700 align-middle mr-0.5"></span>milestone reached
		<span class="inline-block w-[2px] h-2.5 bg-gray-400 align-middle mr-0.5 ml-1.5"></span>pending
	</span>
{/if}
