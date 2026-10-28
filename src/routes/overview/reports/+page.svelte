<script lang="ts">
	import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
	import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
	import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
	import CategoryBars from "$lib/components/charts/CategoryBars.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import {
		HISTORY_RANGES,
		rangeLabel,
		sliceNetWorthRange,
		type HistoryRange,
	} from "$lib/utils/report-ranges";

	let { data } = $props();

	// Phase 5 line 1: 1y / 5y / all range pickers, shared by both charts.
	let range = $state<HistoryRange>("all");

	const ranged = $derived(sliceNetWorthRange(data.netWorthHistory, range));

	function printPage() {
		window.print();
	}
</script>

<div class="p-3">
	<div class="flex justify-between items-baseline mb-2">
		<h1 class="text-lg font-bold">Reports</h1>
		<button type="button" class="bracket-link text-xs" onclick={printPage}>[Print / PDF]</button>
	</div>

	<!-- range picker (shared) -->
	<div class="flex items-center gap-2 mb-2 text-xs">
		<span class="text-gray-500">RANGE</span>
		{#each HISTORY_RANGES as r (r)}
			<button
				type="button"
				class="bracket-link font-bold"
				class:text-green-700={range === r}
				aria-pressed={range === r}
				onclick={() => (range = r)}
			>[{r}]</button>
		{/each}
		<span class="text-gray-500">({rangeLabel(range)})</span>
	</div>

	<!-- Phase 4 V1 #1 + Phase 5 line 1: net worth over time + composition -->
	<div class="grid gap-3 lg:grid-cols-2 max-w-6xl">
		<NetWorthChart points={ranged} formatPence={(p) => formatCurrency(p)} />
		<StackedAreaChart points={ranged} formatPence={(p) => formatCurrency(p)} />
	</div>

	<!-- Phase 5 line 2: spending by month + top categories (latest month) -->
	<div class="grid gap-3 lg:grid-cols-2 max-w-6xl mt-3">
		<MonthlySpendChart points={data.monthlySpend} formatPence={(p) => formatCurrency(p)} />
		<CategoryBars
			month={data.monthlySpend[data.monthlySpend.length - 1]?.month ?? ""}
			categories={data.monthlySpend[data.monthlySpend.length - 1]?.categories ?? []}
		/>
	</div>

	<div class="border border-black mt-3 max-w-6xl">
		<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-b border-black">COMING IN THIS RELEASE</div>
		<div class="text-xs text-gray-600 px-2 py-2 leading-relaxed">
			Interest report (actual vs projected + PSA) · debt report (waterfall + payoff projections) —
			each with export and print support.
		</div>
	</div>
</div>
