<script lang="ts">
	import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
	import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
	import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
	import CategoryBars from "$lib/components/charts/CategoryBars.svelte";
	import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";
	import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";
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

	<!-- Phase 5 line 2: interest report (PSA bullet, current tax year) -->
	{#if data.interestReport}
		<div class="max-w-6xl mt-3">
			<PsaBulletChart
				taxYearLabel={data.interestReport.taxYearLabel}
				band={data.interestReport.band}
				allowancePence={data.interestReport.psaAllowanceInCents}
				actualPence={data.interestReport.actualTaxableInCents}
				projectedPence={data.interestReport.projectedTaxableInCents}
				formatPence={(p) => formatCurrency(p)}
			/>
		</div>
	{/if}

	<!-- Phase 5 line 2: debt report (waterfall + payoff projections) -->
	{#if data.debtReport && data.debtReport.goals.length > 0}
		<div class="max-w-6xl mt-3">
			<DebtWaterfallChart
				goals={data.debtReport.goals}
				totalDebtInCents={data.debtReport.totalDebtInCents}
				projectedDebtFreeDate={data.debtReport.projectedDebtFreeDate}
				formatPence={(p) => formatCurrency(p)}
			/>
		</div>
	{/if}
</div>
