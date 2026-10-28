<script lang="ts">
	/**
	 * Severity legend (proposal #2, 2026-10-27 audit) — rendered under alert
	 * panels so the [!!]/[!]/[i] markers are always self-explanatory.
	 * Terminal aesthetic: monospace markers, semantic colours ONLY.
	 */
	let {
		compact = false
	}: {
		compact?: boolean;
	} = $props();
</script>

<div
	class="px-2 py-1 text-[10px] text-gray-500 border-b border-black flex gap-4 {compact ? 'flex-wrap' : ''}"
>
	<span><span class="text-red-700 font-bold">[!!]</span> critical — act now</span>
	<span><span class="text-amber-700 font-bold">[!]</span> warning — review soon</span>
	<span><span class="text-gray-600 font-bold">[i]</span> info — for awareness</span>
</div>
