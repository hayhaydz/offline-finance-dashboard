<script lang="ts">
	import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
	import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
	import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
	import CategoryBars from "$lib/components/charts/CategoryBars.svelte";
	import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";
	import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { asciiLineChart, asciiSparkline } from "$lib/utils/ascii-charts";
	import {
		HISTORY_RANGES,
		rangeLabel,
		sliceNetWorthRange,
		type HistoryRange,
	} from "$lib/utils/report-ranges";

	let { data } = $props();

	// Phase 5 line 1: 1y / 5y / all range pickers, shared by both charts.
	let range = $state<HistoryRange>("all");

	// Phase 7 line 3: "pure terminal" ASCII render mode (Variant A),
	// remembered per browser.
	let asciiMode = $state(false);
	$effect(() => {
		if (localStorage.getItem("charts-ascii") === "1") asciiMode = true;
	});
	function toggleAscii() {
		asciiMode = !asciiMode;
		localStorage.setItem("charts-ascii", asciiMode ? "1" : "0");
	}

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

	<!-- range picker (shared) + ASCII mode toggle (Phase 7 line 3) -->
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
		<button
			type="button"
			class="bracket-link font-bold ml-2"
			class:text-green-700={asciiMode}
			aria-pressed={asciiMode}
			title="Pure-terminal ASCII render mode (Variant A)"
			onclick={toggleAscii}>[ASCII]</button>
	</div>

	<!-- Phase 4 V1 #1 + Phase 5 line 1: net worth over time + composition -->
	<div class="grid gap-3 lg:grid-cols-2 max-w-6xl">
		{#if asciiMode}
			<section class="chart-panel">
				<div class="chart-panel-title"><span>Net worth over time</span></div>
				<div class="p-2">
					<pre class="ascii-chart">{asciiLineChart(
						ranged.map((p) => p.netWorthInCents),
						{ rows: 8, label: "net" },
					)}</pre>
					<div class="text-xs text-gray-500 mt-1">
						{ranged[0]?.date} → {ranged[ranged.length - 1]?.date} · spark {asciiSparkline(
							ranged.map((p) => p.netWorthInCents),
						)}
					</div>
				</div>
				<div class="chart-panel-summary">ASCII mode (Variant A) — {rangeLabel(range)}</div>
			</section>
		{:else}
			<NetWorthChart points={ranged} formatPence={(p) => formatCurrency(p)} />
		{/if}
		{#if asciiMode}
			<section class="chart-panel">
				<div class="chart-panel-title"><span>Assets vs liabilities</span></div>
				<div class="p-2 flex flex-col gap-1">
					<pre class="ascii-chart">{asciiLineChart(
						ranged.map((p) => p.totalAssetsInCents),
						{ rows: 5, label: "ast" },
					)}</pre>
					<pre class="ascii-chart">{asciiLineChart(
						ranged.map((p) => p.totalLiabilitiesInCents),
						{ rows: 5, label: "lia" },
					)}</pre>
				</div>
				<div class="chart-panel-summary">ASCII mode (Variant A) — {rangeLabel(range)}</div>
			</section>
		{:else}
			<StackedAreaChart points={ranged} formatPence={(p) => formatCurrency(p)} />
		{/if}
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
