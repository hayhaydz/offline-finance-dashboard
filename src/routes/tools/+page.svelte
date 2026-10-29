<script lang="ts">
	import { TOOLS } from "$lib/utils/tool-registry";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Tools index (R13): a card grid — each tool opens its own sub-page
	 * with the full-width detail the old single cramped page could not fit.
	 */

	let { data } = $props<{
		data: {
			taxYearLabel: string;
			band: string;
			psaAllowanceInCents: number;
		};
	}>();
</script>

<div class="p-3 max-w-6xl">
	<div class="flex justify-between items-baseline mb-1">
		<h1 class="text-lg font-bold">Tools</h1>
		<span class="text-xs text-gray-500">{TOOLS.length} TOOLS</span>
	</div>
	<p class="text-xs text-gray-500 mb-3">
		What-if scenarios over your live data — {data.taxYearLabel} · {data.band} band ·
		PSA {formatCurrency(data.psaAllowanceInCents)}
	</p>

	<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
		{#each TOOLS as tool (tool.slug)}
			<a
				href="/tools/{tool.slug}"
				class="border border-black p-2 hover:bg-gray-50 flex flex-col gap-1"
			>
				<span class="font-bold">{tool.name}</span>
				<span class="text-xs text-gray-600 flex-1">{tool.blurb}</span>
				<span class="bracket-link text-xs">Open Tool</span>
			</a>
		{/each}
	</div>
</div>
