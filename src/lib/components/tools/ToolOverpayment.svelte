<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { simulatePayoff } from "$lib/utils/tool-math";
	import type { ToolsData } from "$lib/server/tools";

	// R13: overpayment simulator sub-page — per-debt comparison table of
	// baseline vs +extra scenarios across ALL debts, not just the selected one.

	let { data }: { data: ToolsData } = $props();

	let selectedDebt = $state(0);
	let extraMonthly = $state(50);
	const debt = $derived(data.debtGoals[selectedDebt] ?? data.debtGoals[0]);
	const monthsFromNow = (months: number | null | undefined) =>
		months == null
			? "never"
			: new Date(Date.now() + months * 30 * 86_400_000).toISOString().slice(0, 7);

	const scenarioFor = (d: (typeof data.debtGoals)[number], extra: number) =>
		simulatePayoff({
			balanceInCents: d.balanceInCents,
			aprBasisPoints: d.aprBasisPoints,
			monthlyPaymentInCents: d.minimumMonthlyInCents + extra * 100,
		});

	const minScenario = $derived(debt ? scenarioFor(debt, 0) : null);
	const extraScenario = $derived(
		debt && debt.minimumMonthlyInCents + extraMonthly * 100 > 0
			? scenarioFor(debt, extraMonthly)
			: null,
	);
	const monthsSaved = $derived(
		minScenario?.months != null && extraScenario?.months != null
			? minScenario.months - extraScenario.months
			: null,
	);
	const interestSaved = $derived(
		minScenario?.totalInterestInCents != null &&
			extraScenario?.totalInterestInCents != null
			? minScenario.totalInterestInCents - extraScenario.totalInterestInCents
			: null,
	);
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	{#if data.debtGoals.length === 0}
		<p class="text-gray-500 text-center py-2">[no debt goals with linked accounts]</p>
	{:else}
		<div class="flex items-center gap-2">
			<span class="text-gray-500">FOCUS</span>
			<select
				class="border border-black bg-white px-1 py-0.5 flex-1"
				aria-label="Debt goal"
				bind:value={selectedDebt}
			>
				{#each data.debtGoals as d, i (d.goalId)}
					<option value={i}>{d.name} — {formatCurrency(d.balanceInCents)}</option>
				{/each}
			</select>
		</div>
		<label class="flex items-center gap-2">
			<span class="w-32 shrink-0 text-gray-500">extra / month</span>
			<span class="w-16 shrink-0">£{extraMonthly}</span>
			<input
				type="range"
				min="0"
				max="500"
				step="10"
				bind:value={extraMonthly}
				aria-label="Extra payment per month in pounds"
			/>
		</label>

		<!-- detail the sub-page adds: every debt under the same +extra -->
		<div class="border border-black overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="bg-gray-100 border-b border-black">
						<th class="text-left px-1 py-0.5">Debt</th>
						<th class="text-right px-1 py-0.5">Balance</th>
						<th class="text-right px-1 py-0.5">APR</th>
						<th class="text-right px-1 py-0.5">Debt-free (min)</th>
						<th class="text-right px-1 py-0.5">Debt-free (+£{extraMonthly})</th>
						<th class="text-right px-1 py-0.5">Interest saved</th>
					</tr>
				</thead>
				<tbody>
					{#each data.debtGoals as d (d.goalId)}
						{@const base = scenarioFor(d, 0)}
						{@const plus = scenarioFor(d, extraMonthly)}
						<tr class="border-b border-gray-200 last:border-b-0 {d.goalId === debt?.goalId ? 'bg-gray-50' : ''}">
							<td class="px-1 py-0.5">{d.name}</td>
							<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(d.balanceInCents)}</td>
							<td class="px-1 py-0.5 text-right tabular-nums text-gray-600">
								{d.aprBasisPoints ? `${(d.aprBasisPoints / 100).toFixed(2)}%` : "—"}
							</td>
							<td class="px-1 py-0.5 text-right tabular-nums">{monthsFromNow(base?.months)}</td>
							<td class="px-1 py-0.5 text-right tabular-nums font-bold text-green-700">
								{monthsFromNow(plus?.months)}
							</td>
							<td class="px-1 py-0.5 text-right tabular-nums">
								{base?.totalInterestInCents != null && plus?.totalInterestInCents != null
									? formatCurrency(base.totalInterestInCents - plus.totalInterestInCents)
									: "—"}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if debt}
			<div class="border-t border-gray-300 pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
				<span class="text-gray-500">payment</span>
				<span class="text-right"
					>{formatCurrency(debt.minimumMonthlyInCents)} →
					<span class="font-bold"
						>{formatCurrency(debt.minimumMonthlyInCents + extraMonthly * 100)}</span
					></span
				>
				<span class="text-gray-500">debt-free</span>
				<span class="text-right"
					>{monthsFromNow(minScenario?.months)} →
					<span class="font-bold text-green-700"
						>{monthsFromNow(extraScenario?.months)}</span
					></span
				>
				<span class="text-gray-500">saved</span>
				<span class="text-right font-bold">
					{monthsSaved != null ? `${monthsSaved} months · ` : ""}
					{interestSaved != null && interestSaved > 0 ? formatCurrency(interestSaved) : "—"}
				</span>
			</div>
		{/if}
	{/if}
</div>
