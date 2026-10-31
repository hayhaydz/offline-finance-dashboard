<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { isaMoveTaxSavedPence, taxOnInterestPence, BAND_RATE_PCT, yearlyInterestPence } from "$lib/utils/tool-math";
	import type { ToolsData } from "$lib/server/tools";

	// R13: ISA optimiser sub-page — move slider plus the per-account
	// breakdown of which taxable accounts the move should come from
	// (highest rate first).

	let { data }: { data: ToolsData } = $props();

	const bandRate = $derived(BAND_RATE_PCT[data.band] ?? 20);
	const taxableSavings = $derived(
		data.savingsAccounts
			.filter((a) => a.taxWrapper !== "isa" && a.balanceInCents > 0)
			.slice()
			.sort((a, b) => (b.rateBasisPoints ?? 0) - (a.rateBasisPoints ?? 0)),
	);

	const avgTaxableRateBp = $derived(() => {
		const totalBal = taxableSavings.reduce((s, a) => s + a.balanceInCents, 0);
		if (totalBal <= 0) return 0;
		return Math.round(
			taxableSavings.reduce((s, a) => s + a.balanceInCents * (a.rateBasisPoints ?? 0), 0) /
				totalBal,
		);
	});

	let isaMove = $state(2000);
	const isaMovePence = $derived(Math.min(isaMove * 100, data.isaRoomInCents));
	const taxSavedNow = $derived(
		taxOnInterestPence(
			data.forecastTaxableInterestInCents,
			data.psaAllowanceInCents,
			bandRate,
		),
	);
	const taxSavedAfterMove = $derived(
		isaMoveTaxSavedPence({
			principalMovedPence: isaMovePence,
			rateBasisPoints: avgTaxableRateBp(),
			taxableInterestPence: data.forecastTaxableInterestInCents,
			allowancePence: data.psaAllowanceInCents,
			bandRatePct: bandRate,
		}),
	);

	// detail the sub-page adds: where the moved money should come from
	const moveSources = $derived(() => {
		let remaining = isaMovePence;
		return taxableSavings.flatMap((a) => {
			if (remaining <= 0) return [];
			const take = Math.min(a.balanceInCents, remaining);
			remaining -= take;
			return [
				{
					name: a.name,
					takePence: take,
					rate: (a.rateBasisPoints ?? 0) / 100,
					interestMovedPence: yearlyInterestPence(take, a.rateBasisPoints ?? 0),
				},
			];
		});
	});
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	<label class="flex items-center gap-2">
		<span class="w-32 shrink-0 text-gray-500">move to ISA</span>
		<span class="w-24 shrink-0">£{isaMove.toLocaleString()}</span>
		<input
			type="range"
			min="0"
			max={Math.max(100, Math.floor(data.isaRoomInCents / 100))}
			step="100"
			bind:value={isaMove}
			aria-label="Pounds to move from taxable savings into an ISA"
		/>
	</label>

	<div class="border border-black overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr class="bg-gray-100 border-b border-black">
					<th class="text-left px-1 py-0.5">Move from (highest rate first)</th>
					<th class="text-right px-1 py-0.5">Take</th>
					<th class="text-right px-1 py-0.5">Rate</th>
					<th class="text-right px-1 py-0.5">Yearly interest moved</th>
				</tr>
			</thead>
			<tbody>
				{#each moveSources() as source (source.name)}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="px-1 py-0.5">{source.name}</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(source.takePence)}</td>
						<td class="px-1 py-0.5 text-right tabular-nums text-gray-600">{source.rate.toFixed(2)}%</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(source.interestMovedPence)}</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="px-1 py-0.5 text-gray-500">Move £0 — nothing to source.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="border-t border-gray-300 pt-2 grid grid-cols-2 gap-x-4 gap-y-1 items-baseline">
		<span class="text-gray-500">forecast taxable ({data.taxYearLabel})</span>
		<span class="text-right tabular-nums">{formatCurrency(data.forecastTaxableInterestInCents)}</span>
		<span class="text-gray-500">tax today</span>
		<span class="text-right tabular-nums">{formatCurrency(taxSavedNow)}</span>
		<span class="text-gray-500">tax after move</span>
		<span class="text-right tabular-nums">{formatCurrency(Math.max(0, taxSavedNow - taxSavedAfterMove))}</span>
		<!-- v3.1 A09 craft: the RESULT is the answer — make it the loudest row -->
		<span class="font-bold uppercase text-[10px]">saved</span>
		<span class="text-right text-lg font-bold text-green-700 tabular-nums">{formatCurrency(taxSavedAfterMove)}</span>
	</div>

	<p class="text-gray-600">
		ISA room shown as the full {formatCurrency(data.isaRoomInCents)} allowance
		(per-year subscriptions not tracked). Taxable savings average
		{(avgTaxableRateBp() / 100).toFixed(2)}%.
	</p>
</div>
