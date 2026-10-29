<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { stoozeCalculation } from "$lib/utils/tool-math";

	// NEW tool (R13 "more more more"): stooze economics — what riding a
	// 0% promo earns in savings vs what missing its end costs at the
	// revert APR. Defaults seeded from the user's first stooze-mode card
	// when available.

	let {
		cards,
	}: {
		cards: {
			slug: string;
			name: string;
			outstandingPence: number;
			promoEndsAt: string | null;
			revertAprBasisPoints: number | null;
			creditMode: string | null;
		}[];
	} = $props();

	const stoozeCards = $derived(cards.filter((c) => c.creditMode === "stooze"));
	const first = $derived(stoozeCards[0] ?? cards[0]);

	let balance = $state<number | null>(null);
	let savingsRatePct = $state(4.5);
	let revertAprPct = $state(23.9);
	let promoEnd = $state<string>("");

	// seed from real card once
	let seeded = false;
	$effect(() => {
		if (!seeded && first) {
			seeded = true;
			if (balance === null) balance = first.outstandingPence / 100;
			if (first.revertAprBasisPoints) revertAprPct = first.revertAprBasisPoints / 100;
			if (first.promoEndsAt) promoEnd = first.promoEndsAt.slice(0, 10);
		}
	});

	const result = $derived(
		stoozeCalculation({
			balancePence: (balance ?? 0) * 100,
			savingsRateBasisPoints: Math.round(savingsRatePct * 100),
			revertAprBasisPoints: Math.round(revertAprPct * 100),
			promoEndsAt: promoEnd ? new Date(`${promoEnd}T00:00:00.000Z`) : null,
		}),
	);
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	{#if stoozeCards.length > 0}
		<p class="text-gray-600">
			{stoozeCards.length} card{stoozeCards.length !== 1 ? "s" : ""} in stooze mode —
			{#each stoozeCards as c, i (c.slug)}{#if i > 0}, {/if}{c.name}{/each}.
			Values seeded from {first?.name}.
		</p>
	{:else if cards.length > 0}
		<p class="text-gray-600">No cards in stooze mode — values seeded from {first?.name}.</p>
	{/if}

	<div class="grid grid-cols-2 gap-2">
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">balance £</span>
			<input class="border border-black w-28 px-1" type="number" min="0" bind:value={balance} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">promo ends</span>
			<input class="border border-black px-1" type="date" bind:value={promoEnd} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">savings rate %</span>
			<input class="border border-black w-24 px-1" type="number" min="0" max="15" step="0.1" bind:value={savingsRatePct} /></label>
		<label class="flex items-center gap-2"
			><span class="text-gray-500 w-28 shrink-0">revert APR %</span>
			<input class="border border-black w-24 px-1" type="number" min="0" max="50" step="0.1" bind:value={revertAprPct} /></label>
	</div>

	<div class="border border-black">
		<table class="w-full">
			<tbody>
				<tr class="border-b border-gray-200">
					<td class="px-1 py-0.5 text-gray-600">days remaining in 0% window</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold">{result.daysRemaining}</td>
				</tr>
				<tr class="border-b border-gray-200">
					<td class="px-1 py-0.5 text-gray-600">interest earned in savings (daily compounding)</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold text-green-700">
						{formatCurrency(result.savingsInterestPence)}
					</td>
				</tr>
				<tr class="border-b border-gray-200">
					<td class="px-1 py-0.5 text-gray-600">cost if it rides {result.daysRemaining}d PAST the end (revert APR)</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold text-red-700">
						{formatCurrency(result.revertCostPence)}
					</td>
				</tr>
				<tr class="border-b border-gray-200">
					<td class="px-1 py-0.5 text-gray-600">net gain of stoozing the window</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold {result.netGainPence >= 0 ? 'text-green-700' : 'text-red-700'}">
						{formatCurrency(result.netGainPence)}
					</td>
				</tr>
				<tr>
					<td class="px-1 py-0.5 text-gray-600">pay everything by (5-day clearing buffer)</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold text-amber-700">
						{result.clearByDate ?? "—"}
					</td>
				</tr>
			</tbody>
		</table>
	</div>

	<p class="text-gray-600">
		The stooze only wins while savings rates stay put and the balance clears
		before the promo ends — the pay-by date above is the operational deadline.
	</p>
</div>
