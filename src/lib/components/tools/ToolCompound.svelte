<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { compoundSeries } from "$lib/utils/tool-math";

	// R13: compound projector sub-page — chart plus the yearly milestone
	// table the old card could not fit.

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
	const compoundMax = $derived(Math.max(...compound.map((p) => p.balancePence), 1));
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	<div class="grid grid-cols-2 gap-2">
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-20 shrink-0">start £</span>
			<input class="border border-black w-24 px-1" type="number" min="0" bind:value={compoundPrincipal} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-20 shrink-0">monthly £</span>
			<input class="border border-black w-24 px-1" type="number" min="0" bind:value={compoundMonthly} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-20 shrink-0">rate %</span>
			<input class="border border-black w-24 px-1" type="number" min="0" max="15" step="0.1" bind:value={compoundRatePct} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-20 shrink-0">years</span>
			<input class="border border-black w-24 px-1" type="number" min="1" max="40" bind:value={compoundYears} /></label>
	</div>

	<svg
		viewBox="0 0 600 120"
		class="w-full"
		role="img"
		aria-label="Compound growth projection. {compoundFinal.interestPence > 0
			? `${formatCurrency(compoundFinal.balancePence)} after ${compoundYears} years, of which ${formatCurrency(compoundFinal.interestPence)} is interest`
			: 'no projection yet'}"
	>
		<line x1="4" y1="116" x2="596" y2="116" stroke="var(--chart-grid)" stroke-width="1" />
		{#if compound.length > 1}
			<path
				d={compound
					.map(
						(p, i) =>
							`${i === 0 ? "M" : "L"}${(4 + (i / (compound.length - 1)) * 592).toFixed(1)},${(116 - (p.balancePence / compoundMax) * 104).toFixed(1)}`,
					)
					.join(" ")}
				fill="none"
				stroke="var(--chart-ink)"
				stroke-width="1.5"
			/>
			<path
				d={compound
					.map(
						(p, i) =>
							`${i === 0 ? "M" : "L"}${(4 + (i / (compound.length - 1)) * 592).toFixed(1)},${(116 - (p.contributedPence / compoundMax) * 104).toFixed(1)}`,
					)
					.join(" ")}
				class="chart-dashed"
				fill="none"
				stroke="var(--chart-ink-soft)"
				stroke-width="1"
			/>
		{/if}
	</svg>

	<!-- detail the sub-page adds -->
	<div class="border border-black overflow-x-auto max-h-72 overflow-y-auto">
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
					<tr class="border-b border-gray-200 last:border-b-0">
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
	<p class="text-gray-600">Solid line: balance · dashed: contributions.</p>
</div>
