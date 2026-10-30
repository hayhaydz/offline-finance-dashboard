<script lang="ts">
	import ToolCompound from "$lib/components/tools/ToolCompound.svelte";
	import ToolFiProjector from "$lib/components/tools/ToolFiProjector.svelte";
	import ToolOverpaySave from "$lib/components/tools/ToolOverpaySave.svelte";
	import ToolIsaOptimiser from "$lib/components/tools/ToolIsaOptimiser.svelte";
	import ToolOverpayment from "$lib/components/tools/ToolOverpayment.svelte";
	import ToolRateWhatIf from "$lib/components/tools/ToolRateWhatIf.svelte";
	import ToolStooze from "$lib/components/tools/ToolStooze.svelte";
	import type { ToolMeta } from "$lib/utils/tool-registry";
	import type { ToolsData } from "$lib/server/tools";

	interface StoozeCard {
		slug: string;
		name: string;
		outstandingPence: number;
		promoEndsAt: string | null;
		revertAprBasisPoints: number | null;
		creditMode: string | null;
	}

	let {
		data,
	}: {
		data: {
			tool: ToolMeta;
			toolsData: ToolsData;
			cards: StoozeCard[];
			netWorthHistory: { date: string; netWorthInCents: number }[];
		};
	} = $props();

	function printPage() {
		window.print();
	}
</script>

<div class="p-3 max-w-6xl">
	<div class="flex justify-between items-baseline mb-1">
		<h1 class="text-lg font-bold">{data.tool.name}</h1>
		<span class="flex gap-3 text-xs">
			<a href="/tools" class="bracket-link">All Tools</a>
			<button type="button" class="bracket-link" onclick={printPage}>Print / PDF</button>
		</span>
	</div>
	<p class="text-xs text-gray-500 mb-3">{data.tool.blurb}</p>

	<div class="border border-black">
		{#if data.tool.slug === "rate-what-if"}
			<ToolRateWhatIf data={data.toolsData} />
		{:else if data.tool.slug === "overpayment"}
			<ToolOverpayment data={data.toolsData} />
		{:else if data.tool.slug === "isa-optimiser"}
			<ToolIsaOptimiser data={data.toolsData} />
		{:else if data.tool.slug === "compound"}
			<ToolCompound />
		{:else if data.tool.slug === "stooze"}
			<ToolStooze cards={data.cards} />
		{:else if data.tool.slug === "fi-projector"}
			<ToolFiProjector history={data.netWorthHistory} />
		{:else if data.tool.slug === "overpay-or-save"}
			<ToolOverpaySave data={data.toolsData} />
		{/if}
	</div>
</div>
