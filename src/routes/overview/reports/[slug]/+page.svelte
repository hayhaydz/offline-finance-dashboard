<script lang="ts">
	import NetWorthChart from "$lib/components/charts/NetWorthChart.svelte";
	import StackedAreaChart from "$lib/components/charts/StackedAreaChart.svelte";
	import PsaBulletChart from "$lib/components/charts/PsaBulletChart.svelte";
	import MonthlySpendChart from "$lib/components/charts/MonthlySpendChart.svelte";
	import CategoryBars from "$lib/components/charts/CategoryBars.svelte";
	import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { asciiLineChart, asciiSparkline } from "$lib/utils/ascii-charts";
	import type { ReportDoc, ReportRow } from "$lib/server/reports-v2";

	/**
	 * Science-paper template (R10): title block → abstract → method →
	 * findings, rendered in the terminal aesthetic. Sections carry
	 * key/value/flag tables (semantic colours only), notes, and optional
	 * figures rendered by the existing chart components.
	 */

	let {
		data,
	}: {
		data: {
			report: ReportDoc;
			siblings?: {
				prev: { slug: string; title: string } | null;
				next: { slug: string; title: string } | null;
			};
		};
	} = $props();
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

	// R-H2: pure-terminal ASCII render mode for line figures (Variant A),
	// remembered per browser — the toggle the old reports page had.
	let asciiMode = $state(false);

	// v3.1: only papers with a line figure (netWorth/stackedArea) have an
	// ASCII variant — hide the toggle on papers where it would no-op
	const hasAsciiFigures = $derived(
		data.report.findings.some((s: { figure?: string }) => s.figure === "netWorth" || s.figure === "stackedArea")
	);
	$effect(() => {
		if (localStorage.getItem("charts-ascii") === "1") asciiMode = true;
	});
	function toggleAscii() {
		asciiMode = !asciiMode;
		localStorage.setItem("charts-ascii", asciiMode ? "1" : "0");
	}
</script>

<article class="p-3">
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
				<a href="/overview/reports" class="bracket-link">All Reports</a>
				<button type="button" class="bracket-link" onclick={printPage}>Print / PDF</button>
				{#if hasAsciiFigures}
					<button
						type="button"
						class="bracket-link font-bold"
						class:text-green-700={asciiMode}
						aria-pressed={asciiMode}
						title="Pure-terminal ASCII render mode for line figures"
						onclick={toggleAscii}>ASCII</button
					>
				{/if}
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

		<!-- Findings: full-width paper (R1/R29); table sections pair up in a
		     2-col grid ONLY when two or more tables exist (a lone table
		     spans full width — no empty quadrant); figures always span.
		     A13: the layerchart panels grow after mount — neutralise the
		     bento h-full stretch here so grid rows reflow with content. -->
		{#if report.findings}
			{@const tableSections = report.findings.filter((s) => !s.figure && (s.rows?.length ?? 0) > 0).length}
			{@const tableIdxs = report.findings.map((s, i) => (!s.figure && (s.rows?.length ?? 0) > 0 ? i : -1)).filter((i) => i >= 0)}
			{@const lastTableIdx = tableIdxs.length > 0 && tableIdxs.length % 2 === 1 ? tableIdxs[tableIdxs.length - 1] : -1}
			<div class="grid md:grid-cols-2 md:divide-x md:divide-gray-300 [&_figure.chart-panel]:h-auto">
			{#each report.findings as section, i (section.heading)}
				<!-- v3.1 A09 D2 fix: an ODD number of half-width table sections
				     leaves the right column dead below the last pairing
				     (savings-rate's RUNWAY hugged bottom-left w/ a ~600px
				     hole beside it) — the final table of an odd run spans 2 -->
				<section
					class="{i > 0 ? 'border-t' : ''} {section.figure || tableSections < 2 || i === lastTableIdx ? 'md:col-span-2 md:border-t' : ''} border-black p-2"
				>
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
					{#if asciiMode}
						<section class="chart-panel">
							<div class="chart-panel-title"><span>Net worth over time</span></div>
							<div class="p-2">
								<pre class="ascii-chart max-w-3xl">{asciiLineChart(
									report.netWorthHistory.map((p) => p.netWorthInCents),
									{ rows: 8, label: "net" },
								)}</pre>
								<div class="text-xs text-gray-500 mt-1">
									{report.netWorthHistory[0]?.date} → {report.netWorthHistory[report.netWorthHistory.length - 1]?.date}
									· spark {asciiSparkline(report.netWorthHistory.map((p) => p.netWorthInCents))}
								</div>
							</div>
							<div class="chart-panel-summary">ASCII mode — {report.netWorthHistory.length} observations</div>
						</section>
					{:else}
						<NetWorthChart
							points={report.netWorthHistory}
							formatPence={(p) => formatCurrency(p)}
						/>
					{/if}
				{/if}
				{#if section.figure === "stackedArea" && report.netWorthHistory && report.netWorthHistory.length > 1}
					{#if asciiMode}
						<section class="chart-panel">
							<div class="chart-panel-title"><span>Assets vs liabilities</span></div>
							<div class="p-2 flex flex-col gap-1">
								<pre class="ascii-chart max-w-3xl">{asciiLineChart(
									report.netWorthHistory.map((p) => p.totalAssetsInCents),
									{ rows: 5, label: "ast" },
								)}</pre>
								<pre class="ascii-chart max-w-3xl">{asciiLineChart(
									report.netWorthHistory.map((p) => p.totalLiabilitiesInCents),
									{ rows: 5, label: "lia" },
								)}</pre>
							</div>
							<div class="chart-panel-summary">ASCII mode — assets / liabilities bands</div>
						</section>
					{:else}
						<StackedAreaChart
							points={report.netWorthHistory}
							formatPence={(p) => formatCurrency(p)}
						/>
					{/if}
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
		{/if}
	</div>

	<!-- R-H12: dated-series reading nav — prev/next through the registry -->
	{#if data.siblings?.prev || data.siblings?.next}
		<nav aria-label="Related reading" class="mt-2 border border-black no-print flex flex-nowrap items-center justify-between gap-4 p-2 text-xs overflow-x-auto">
			<span class="font-bold flex-none">RELATED READING</span>
			<span class="flex flex-nowrap gap-4 items-center min-w-0">
				{#if data.siblings?.prev}
					<a href="/overview/reports/{data.siblings.prev.slug}" class="bracket-link whitespace-nowrap">← {data.siblings.prev.title}</a>
				{/if}
				<a href="/overview/reports" class="bracket-link flex-none">All Reports</a>
				{#if data.siblings?.next}
					<a href="/overview/reports/{data.siblings.next.slug}" class="bracket-link whitespace-nowrap">{data.siblings.next.title} →</a>
				{/if}
			</span>
		</nav>
	{/if}

	<footer class="text-xs text-gray-500 mt-2 flex justify-between">
		<span>offline-finance v3 · report {report.slug}</span>
		<span>{displayDate(report.date)}</span>
	</footer>
</article>
