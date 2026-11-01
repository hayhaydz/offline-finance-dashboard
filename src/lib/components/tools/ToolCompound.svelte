<script lang="ts">
	import { browser } from "$app/environment";
	import { LineChart } from "layerchart";
	import { formatCurrency } from "$lib/utils/currency";
	import { compoundSeries } from "$lib/utils/tool-math";

	// R13: compound projector sub-page — chart plus the yearly milestone
	// table the old card could not fit.
	// v3.1 third mandate (A13): the hand-rolled axis-less SVG is retired —
	// the tool converges on the HistoryTrendChart pattern (layerchart,
	// axes, hover tooltip, caption at the chart). The year table drops
	// its inner max-h scroll (hid year 10 with no affordance; the page
	// owns scrolling) and the form re-grids to 4 true columns.

	let compoundPrincipal = $state(1000);
	let compoundMonthly = $state(100);
	let compoundRatePct = $state(4);
	let compoundYears = $state(10);
	const compoundRateBp = $derived(Math.round(compoundRatePct * 100));
	const compound = $derived(
		compoundSeries({
			principalPence: compoundPrincipal * 100,
			monthlyPence: compoundMonthly * 100,
			rateBasisPoints: compoundRateBp,
			years: compoundYears,
		}),
	);
	const compoundFinal = $derived(compound[compound.length - 1]);

	/** compact axis labels (pence → "£4,000"); tooltips keep full precision */
	function compactPence(pence: number): string {
		if (Math.abs(pence) >= 100_000) return `£${Math.round(Math.abs(pence) / 100 / 1000)}k`;
		return `£${Math.round(Math.abs(pence) / 100).toLocaleString("en-GB")}`;
	}

	type Row = { year: number; balance: number; contributed: number };
	const rows = $derived(
		compound.map((p): Row => ({ year: p.year, balance: p.balancePence, contributed: p.contributedPence })),
	);
	const yMax = $derived(Math.max(...rows.map((r) => r.balance), 1) * 1.08);
	// one tick per year when few, else every 5th (matches table density)
	const yearTicks = $derived(
		rows.length <= 12
			? rows.map((r) => r.year)
			: rows.filter((r) => r.year % 5 === 0 || r.year === 1).map((r) => r.year),
	);

	const series = [
		{
			key: "balance",
			label: "balance",
			value: "balance",
			color: "#111827",
			props: { strokeWidth: 1.5 },
		},
		{
			key: "contributed",
			label: "contributed",
			value: "contributed",
			color: "#6b7280",
			props: { "stroke-dasharray": "4 3", strokeWidth: 1 },
		},
	];
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	<div class="grid grid-cols-4 gap-2">
		<label class="flex items-center gap-2 min-w-0"
			><span class="text-gray-500 w-16 shrink-0">start £</span>
			<input class="border border-black w-full min-w-0 px-1" type="number" min="0" bind:value={compoundPrincipal} /></label>
		<label class="flex items-center gap-2 min-w-0"
			><span class="text-gray-500 w-16 shrink-0">monthly £</span>
			<input class="border border-black w-full min-w-0 px-1" type="number" min="0" bind:value={compoundMonthly} /></label>
		<label class="flex items-center gap-2 min-w-0"
			><span class="text-gray-500 w-16 shrink-0">rate %</span>
			<input class="border border-black w-full min-w-0 px-1" type="number" min="0" max="15" step="0.1" bind:value={compoundRatePct} /></label>
		<label class="flex items-center gap-2 min-w-0"
			><span class="text-gray-500 w-16 shrink-0">years</span>
			<input class="border border-black w-full min-w-0 px-1" type="number" min="1" max="40" bind:value={compoundYears} /></label>
	</div>

	{#if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="compound"
			role="img"
			aria-label="Compound growth projection, interactive. {compoundFinal.interestPence > 0
				? `${formatCurrency(compoundFinal.balancePence)} after ${compoundYears} years, of which ${formatCurrency(compoundFinal.interestPence)} is interest`
				: 'no projection yet'}"
		>
			<LineChart
				data={rows}
				x="year"
				{series}
				height={170}
				padding={{ top: 8, right: 16, bottom: 26, left: 52 }}
				yDomain={[0, yMax]}
				xDomain={rows.length ? [rows[0].year, rows[rows.length - 1].year] : undefined}
				xNice={false}
				props={{
					xAxis: { ticks: yearTicks, format: (y: number) => `${y}y` },
					yAxis: { format: (v: number) => compactPence(v) },
					tooltip: {
						header: { format: (y: number) => `year ${y}` },
						item: { format: (v: number) => formatCurrency(v) },
					},
				}}
			/>
		</div>
		<p class="text-[10px] text-gray-600 px-1">
			solid = balance · dashed = contributions · hover for year + £
		</p>
	{:else}
		<!-- V1 CLS fix (2026-11-01): reserve the chart's exact height
		     server-side — see AllocationBar. -->
		<div class="border border-dashed border-gray-200" style="height: 170px" aria-hidden="true"></div>
		<p class="text-[10px] text-gray-600 px-1">
			solid = balance · dashed = contributions · hover for year + £
		</p>
	{/if}

	<!-- detail the sub-page adds (no inner max-h: the page owns scrolling —
	     the old 288px cap hid the final year with no affordance) -->
	<div class="border border-black overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr class="bg-gray-100 border-b border-black">
					<th class="text-left px-1 py-0.5">Year</th>
					<th class="text-right px-1 py-0.5">Balance</th>
					<th class="text-right px-1 py-0.5">Contributed</th>
					<th class="text-right px-1 py-0.5">Interest (cum.)</th>
					<th class="text-right px-1 py-0.5">Interest this year</th>
				</tr>
			</thead>
			<tbody>
				{#each compound.slice(1) as point, i (point.year)}
					<tr class="border-b border-gray-200 last:border-b-0 {point.year === compoundYears ? 'font-bold' : ''}">
						<td class="px-1 py-0.5">{point.year}</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(point.balancePence)}</td>
						<td class="px-1 py-0.5 text-right tabular-nums text-gray-600">{formatCurrency(point.contributedPence)}</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(point.interestPence)}</td>
						<td class="px-1 py-0.5 text-right tabular-nums">
							{formatCurrency(point.interestPence - (compound[i]?.interestPence ?? 0))}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="grid grid-cols-2 gap-x-4 gap-y-1">
		<span class="text-gray-500">after {compoundYears}y</span>
		<span class="text-right font-bold">{formatCurrency(compoundFinal.balancePence)}</span>
		<span class="text-gray-500">interest earned</span>
		<span class="text-right font-bold text-green-700">{formatCurrency(compoundFinal.interestPence)}</span>
	</div>
</div>
