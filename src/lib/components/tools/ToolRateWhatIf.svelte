<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { yearlyInterestPence, taxOnInterestPence, BAND_RATE_PCT } from "$lib/utils/tool-math";
	import type { ToolsData } from "$lib/server/tools";

	// R13: rate-change what-if as a full sub-page — per-account sliders
	// PLUS the scenario table the old cramped card could not fit.

	let { data }: { data: ToolsData } = $props();

	const bandRate = $derived(BAND_RATE_PCT[data.band] ?? 20);
	const taxableSavings = $derived(
		data.savingsAccounts.filter((a) => a.taxWrapper !== "isa" && a.balanceInCents > 0),
	);

	let rateDeltas = $state<Record<string, number>>({});
	const deltaFor = (slug: string) => rateDeltas[slug] ?? 0;

	const baselineYearlyTaxable = $derived(
		taxableSavings.reduce(
			(sum, a) => sum + yearlyInterestPence(a.balanceInCents, a.rateBasisPoints ?? 0),
			0,
		),
	);
	const scenarioYearlyTaxable = $derived(
		taxableSavings.reduce(
			(sum, a) =>
				sum +
				yearlyInterestPence(
					a.balanceInCents,
					Math.max(0, (a.rateBasisPoints ?? 0) + deltaFor(a.slug)),
				),
			0,
		),
	);
	const baselineTax = $derived(
		taxOnInterestPence(baselineYearlyTaxable, data.psaAllowanceInCents, bandRate),
	);
	const scenarioTax = $derived(
		taxOnInterestPence(scenarioYearlyTaxable, data.psaAllowanceInCents, bandRate),
	);
	const dirty = $derived(
		taxableSavings.some((a) => deltaFor(a.slug) !== 0),
	);
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	{#if taxableSavings.length === 0}
		<p class="text-gray-500 text-center py-2">
			[no taxable savings accounts with balances]
		</p>
	{:else}
		{#each taxableSavings as a (a.slug)}
			<label class="flex items-center gap-2">
				<span class="w-40 truncate shrink-0" title={a.name}>{a.name}</span>
				<span class="w-20 text-right text-gray-500 shrink-0"
					>{((a.rateBasisPoints ?? 0) / 100).toFixed(2)}%</span
				>
				<input
					type="range"
					min="-200"
					max="200"
					step="5"
					value={deltaFor(a.slug)}
					aria-label="Rate change for {a.name} in basis points"
					oninput={(e) =>
						(rateDeltas[a.slug] = Number((e.target as HTMLInputElement).value))}
				/>
				<span
					class="w-16 text-right shrink-0 font-bold {deltaFor(a.slug) === 0
						? 'text-gray-500'
						: deltaFor(a.slug) > 0
							? 'text-green-700'
							: 'text-red-700'}"
				>
					{deltaFor(a.slug) > 0 ? "+" : ""}{deltaFor(a.slug) / 100}%
				</span>
			</label>
		{/each}

		<!-- Scenario table: the detail the sub-page adds -->
		<div class="border border-black overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="bg-gray-100 border-b border-black">
						<th class="text-left px-1 py-0.5">Account</th>
						<th class="text-right px-1 py-0.5">Balance</th>
						<th class="text-right px-1 py-0.5">Rate</th>
						<th class="text-right px-1 py-0.5">→ Rate</th>
						<th class="text-right px-1 py-0.5">Yearly interest →</th>
					</tr>
				</thead>
				<tbody>
					{#each taxableSavings as a (a.slug)}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="px-1 py-0.5">{a.name}</td>
							<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(a.balanceInCents)}</td>
							<td class="px-1 py-0.5 text-right tabular-nums text-gray-600">
								{((a.rateBasisPoints ?? 0) / 100).toFixed(2)}%
							</td>
							<td class="px-1 py-0.5 text-right tabular-nums font-bold {deltaFor(a.slug) > 0 ? 'text-green-700' : deltaFor(a.slug) < 0 ? 'text-red-700' : ''}">
								{((a.rateBasisPoints ?? 0) + deltaFor(a.slug)) / 100}%
							</td>
							<td class="px-1 py-0.5 text-right tabular-nums">
								{formatCurrency(yearlyInterestPence(a.balanceInCents, a.rateBasisPoints ?? 0))}
								→
								<span class="font-bold">
									{formatCurrency(yearlyInterestPence(a.balanceInCents, Math.max(0, (a.rateBasisPoints ?? 0) + deltaFor(a.slug))))}
								</span>
							</td>
						</tr>
					{/each}
					<tr class="bg-gray-50 border-t border-black">
						<td class="px-1 py-0.5 font-bold" colspan="4">total taxable interest</td>
						<td class="px-1 py-0.5 text-right tabular-nums font-bold">
							{formatCurrency(baselineYearlyTaxable)} →
							<span class={scenarioYearlyTaxable > baselineYearlyTaxable ? 'text-green-700' : 'text-red-700'}>
								{formatCurrency(scenarioYearlyTaxable)}
							</span>
						</td>
					</tr>
					<tr class="bg-gray-50">
						<td class="px-1 py-0.5 font-bold" colspan="4">tax above PSA ({data.band} band)</td>
						<td class="px-1 py-0.5 text-right tabular-nums font-bold {scenarioTax > baselineTax ? 'text-red-700' : 'text-green-700'}">
							{formatCurrency(baselineTax)} → {formatCurrency(scenarioTax)}
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		{#if dirty}
			<button
				type="button"
				class="bracket-link self-start"
				onclick={() => (rateDeltas = {})}
			>[Reset All Sliders]</button>
		{/if}
	{/if}
</div>
