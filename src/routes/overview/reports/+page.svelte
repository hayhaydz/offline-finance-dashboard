<script lang="ts">
	import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
	import { formatCurrency } from "$lib/utils/currency";

	let { data } = $props();
</script>

<div class="p-3">
	<div class="flex justify-between items-baseline mb-2">
		<h1 class="text-lg font-bold">Reports</h1>
		<span class="text-xs text-gray-500">[Print / PDF]</span>
	</div>

	<!-- Phase 4 V1 #1: net worth over time (all snapshots) -->
	<div class="max-w-3xl">
		<NetWorthChart points={data.netWorthHistory} formatPence={(p) => formatCurrency(p)} />
	</div>

	<div class="border border-black mt-3 max-w-3xl">
		<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-b border-black">COMING IN THIS RELEASE</div>
		<div class="text-xs text-gray-600 px-2 py-2 leading-relaxed">
			Spending by category · interest report (actual vs projected + PSA) · debt report
			(waterfall + payoff projections) — each with export and print support.
		</div>
	</div>
</div>
