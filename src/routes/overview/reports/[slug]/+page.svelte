<script lang="ts">
	import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
	import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
	import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";
	import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
	import CategoryBars from "$lib/components/charts/CategoryBars.svelte";
	import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import type { ReportDoc, ReportRow } from "$lib/server/reports-v2";

	/**
	 * Science-paper template (R10): title block → abstract → method →
	 * findings, rendered in the terminal aesthetic. Sections carry
	 * key/value/flag tables (semantic colours only), notes, and optional
	 * figures rendered by the existing chart components.
	 */

	let { data }: { data: { report: ReportDoc } } = $props();
	const report = $derived(data.report);

	function flagClass(flag: ReportRow["flag"]): string {
		if (flag === "green") return "text-green-700";
		if (flag === "amber") return "text-amber-700";
		if (flag === "red") return "text-red-700";
		return "";
	}

	function displayDate(iso: string): string {
		const date = new Date(`${iso}T00:00:00.000Z`);
		return date
			.toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			})
			.toUpperCase();
	}

	function printPage() {
		window.print();
	}
</script>

<article class="p-3 max-w-6xl">
	<div class="border border-black">
		<!-- Title block -->
		<header class="bg-gray-100 border-b border-black p-2 flex justify-between items-baseline gap-4">
			<h1 class="text-lg font-bold">{report.title}</h1>
			<span class="text-xs whitespace-nowrap">{displayDate(report.date)}</span>
		</header>

		<!-- Abstract -->
		<section class="border-b border-black p-2">
			<h2 class="font-bold text-xs mb-1">ABSTRACT</h2>
			<p class="text-sm leading-relaxed">{report.abstract}</p>
			<div class="flex gap-3 mt-2 text-xs">
				<a href="/overview/reports" class="bracket-link">[All Reports]</a>
				<button type="button" class="bracket-link" onclick={printPage}>[Print / PDF]</button>
			</div>
		</section>

		<!-- Method -->
		<section class="border-b border-black p-2 bg-gray-50">
			<h2 class="font-bold text-xs mb-1">METHOD</h2>
			<ul class="text-xs text-gray-700 list-disc ml-4">
				{#each report.method as line (line)}
					<li>{line}</li>
				{/each}
			</ul>
		</section>

		<!-- Findings -->
		{#each report.findings as section, i (section.heading)}
			<section class="{i > 0 ? 'border-t' : ''} border-black p-2">
				<h2 class="font-bold text-xs mb-2 uppercase">{section.heading}</h2>

				{#if section.rows && section.rows.length > 0}
					<div class="border border-black overflow-x-auto mb-2">
						<table class="w-full text-xs">
							<tbody>
								{#each section.rows as row (row.label)}
									<tr class="border-b border-gray-200 last:border-b-0">
										<td class="px-1 py-0.5 text-gray-600">{row.label}</td>
										<td class="px-1 py-0.5 text-right tabular-nums font-bold {flagClass(row.flag)}">{row.value}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if section.figure === "netWorth" && report.netWorthHistory && report.netWorthHistory.length > 1}
					<NetWorthChart
						points={report.netWorthHistory}
						formatPence={(p) => formatCurrency(p)}
					/>
				{/if}
				{#if section.figure === "stackedArea" && report.netWorthHistory && report.netWorthHistory.length > 1}
					<StackedAreaChart
						points={report.netWorthHistory}
						formatPence={(p) => formatCurrency(p)}
					/>
				{/if}
				{#if section.figure === "psaBullet" && report.interest}
					<PsaBulletChart
						taxYearLabel={report.interest.taxYearLabel}
						band={report.interest.band}
						allowancePence={report.interest.allowancePence}
						actualPence={report.interest.actualPence}
						projectedPence={report.interest.projectedPence}
						formatPence={(p) => formatCurrency(p)}
					/>
				{/if}

				{#if section.figure === "monthlySpend" && report.monthlySpend && report.monthlySpend.length > 0}
					<MonthlySpendChart
						points={report.monthlySpend}
						formatPence={(p) => formatCurrency(p)}
					/>
				{/if}
				{#if section.figure === "categoryBars" && report.monthlySpend && report.monthlySpend.length > 0}
					{@const latest = report.monthlySpend[report.monthlySpend.length - 1]}
					<CategoryBars month={latest.month} categories={latest.categories} />
				{/if}
				{#if section.figure === "debtWaterfall" && report.debt && report.debt.goals.length > 0}
					<DebtWaterfallChart
						goals={report.debt.goals.map((g) => ({
							...g,
							projectedPayoffDate: g.projectedPayoffDate
								? new Date(`${g.projectedPayoffDate}T00:00:00.000Z`)
								: null,
						}))}
						totalDebtInCents={report.debt.totalDebtInCents}
						projectedDebtFreeDate={report.debt.projectedDebtFreeDate
							? new Date(`${report.debt.projectedDebtFreeDate}T00:00:00.000Z`)
							: null}
						formatPence={(p) => formatCurrency(p)}
					/>
				{/if}

				{#if section.notes && section.notes.length > 0}
					<ul class="text-xs text-gray-600 list-disc ml-4">
						{#each section.notes as note (note)}
							<li>{note}</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>

	<footer class="text-xs text-gray-500 mt-2 flex justify-between">
		<span>offline-finance v3 · report {report.slug}</span>
		<span>{displayDate(report.date)}</span>
	</footer>
</article>
