<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { overpayVsSave } from "$lib/utils/tool-math";
	import type { ToolsData } from "$lib/server/tools";

	// NEW tool (R-H16): overpay the debt or save the money? Overpaying
	// "earns" the APR tax-free (interest never charged); taxable savings
	// earn gross-minus-band. Seeded with the user's best savings rate and
	// real debt goals.

	let { data }: { data: ToolsData } = $props();

	const bestGrossBps = $derived(
		Math.max(0, ...data.savingsAccounts.map((a) => a.rateBasisPoints ?? 0)),
	);

	let savingsRatePct = $state<number | null>(null);
	let inIsa = $state(false);
	let extraMonthly = $state<number | null>(null);

	const effectiveSavingsPct = $derived(
		savingsRatePct ?? Math.round(bestGrossBps) / 100,
	);

	const bandRatePercent = $derived(
		data.band === "additional" ? 45 : data.band === "higher" ? 40 : 20,
	);

	const rows = $derived(
		data.debtGoals.map((d) => ({
			name: d.name,
			balanceInCents: d.balanceInCents,
			aprBps: d.aprBasisPoints ?? 0,
			result: overpayVsSave({
				aprBasisPoints: d.aprBasisPoints ?? 0,
				savingsRateBasisPoints: Math.round(effectiveSavingsPct * 100),
				inIsa,
				bandRatePercent,
				extraMonthlyPence: (extraMonthly ?? 0) * 100,
			}),
		})),
	);
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	{#if data.savingsAccounts.length > 0}
		<p class="text-gray-600">
			Your best recorded savings rate seeds the comparison:
			{(bestGrossBps / 100).toFixed(2)}%
			({data.savingsAccounts.find((a) => a.rateBasisPoints === bestGrossBps)?.name ?? "—"}).
			Tax band {data.band} → interest taxed at {bandRatePercent}%
			{inIsa ? "(ISA: tax-free)" : ""}.
		</p>
	{:else}
		<p class="text-gray-600">No savings rates recorded — enter one below.</p>
	{/if}

	<div class="grid grid-cols-3 gap-2">
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">savings rate %</span>
			<input class="border border-black w-24 px-1" type="number" min="0" max="15" step="0.1" bind:value={savingsRatePct} placeholder={String((bestGrossBps / 100).toFixed(1))} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">extra £/month</span>
			<input class="border border-black w-24 px-1" type="number" min="0" bind:value={extraMonthly} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">savings in ISA?</span>
			<input class="border border-black w-4 h-4" type="checkbox" bind:checked={inIsa} /></label>
	</div>

	{#if data.debtGoals.length === 0}
		<div class="border border-black p-2 text-gray-600">
			No debt goals with linked accounts — link a debt account to a goal to
			compare overpaying against saving.
		</div>
	{:else}
		<div class="border border-black overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="bg-gray-100 border-b border-black">
						<th class="text-left px-1 py-0.5" scope="col">Debt</th>
						<th class="text-right px-1 py-0.5" scope="col">APR</th>
						<th class="text-right px-1 py-0.5" scope="col">Net savings</th>
						<th class="text-right px-1 py-0.5" scope="col">Per £1,000/yr</th>
						<th class="text-right px-1 py-0.5" scope="col">First year on extra</th>
						<th class="text-left px-1 py-0.5" scope="col">Verdict</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.name)}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="px-1 py-0.5">{row.name}</td>
							<td class="px-1 py-0.5 text-right tabular-nums">{(row.aprBps / 100).toFixed(2)}%</td>
							<td class="px-1 py-0.5 text-right tabular-nums text-gray-600">{(row.result.netSavingsBasisPoints / 100).toFixed(2)}%</td>
							<td class="px-1 py-0.5 text-right tabular-nums font-bold {row.result.advantageBasisPoints > 0 ? 'text-green-700' : row.result.advantageBasisPoints < 0 ? 'text-amber-700' : ''}">
								{row.result.advantageBasisPoints > 0 ? '+' : ''}{formatCurrency(row.result.benefitPer1000Pence)}
							</td>
							<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(row.result.firstYearBenefitPence)}</td>
							<td class="px-1 py-0.5 font-bold {row.result.advantageBasisPoints > 0 ? 'text-green-700' : row.result.advantageBasisPoints < 0 ? 'text-amber-700' : ''}">
								{row.result.advantageBasisPoints > 0 ? 'overpay wins' : row.result.advantageBasisPoints < 0 ? 'save wins' : 'level'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="text-gray-600">
			Overpaying "earns" the APR risk-free and tax-free — interest never
			charged. Taxable savings earn the gross rate minus your band's tax on
			interest ({bandRatePercent}% at {data.band}). Simple one-year figures,
			no compounding. Savings flexibility is worth something too — money
			paid into a debt is gone until the balance falls.
		</p>
	{/if}
</div>
