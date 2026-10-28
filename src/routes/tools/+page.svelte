<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import {
		BAND_RATE_PCT,
		compoundSeries,
		isaMoveTaxSavedPence,
		simulatePayoff,
		taxOnInterestPence,
		yearlyInterestPence,
	} from "$lib/utils/tool-math";

	let { data } = $props();

	/* ── shared helpers ─────────────────────────────────────────── */
	const bandRate = $derived(BAND_RATE_PCT[data.band] ?? 20);
	const taxableSavings = $derived(
		data.savingsAccounts.filter((a) => a.taxWrapper !== "isa" && a.balanceInCents > 0),
	);
	const monthsFromNow = (months: number | null | undefined) =>
		months == null
			? "never"
			: new Date(Date.now() + months * 30 * 86_400_000)
					.toISOString()
					.slice(0, 7);

	/* ── tool 1: rate-change what-if ────────────────────────────── */
	// per-account slider offsets in basis points applied to the current rate
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

	/* ── tool 2: overpayment simulator ──────────────────────────── */
	let selectedDebt = $state(0);
	let extraMonthly = $state(50);
	const debt = $derived(data.debtGoals[selectedDebt] ?? data.debtGoals[0]);
	const minScenario = $derived(
		debt
			? simulatePayoff({
					balanceInCents: debt.balanceInCents,
					aprBasisPoints: debt.aprBasisPoints,
					monthlyPaymentInCents: debt.minimumMonthlyInCents,
				})
			: null,
	);
	const extraScenario = $derived(
		debt && debt.minimumMonthlyInCents + extraMonthly * 100 > 0
			? simulatePayoff({
					balanceInCents: debt.balanceInCents,
					aprBasisPoints: debt.aprBasisPoints,
					monthlyPaymentInCents: debt.minimumMonthlyInCents + extraMonthly * 100,
				})
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

	/* ── tool 3: ISA optimiser ──────────────────────────────────── */
	// weighted-average rate across taxable savings (what a moved £ earns)
	const avgTaxableRateBp = $derived(() => {
		const totalBal = taxableSavings.reduce((s, a) => s + a.balanceInCents, 0);
		if (totalBal <= 0) return 0;
		return Math.round(
			taxableSavings.reduce(
				(s, a) => s + a.balanceInCents * (a.rateBasisPoints ?? 0),
				0,
			) / totalBal,
		);
	});
	let isaMove = $state(2000); // £ moved from taxable → ISA
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

	/* ── tool 4: savings compound projector ─────────────────────── */
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

	function printPage() {
		window.print();
	}
</script>

<div class="p-3">
	<div class="flex justify-between items-baseline mb-2">
		<h1 class="text-lg font-bold">Tools</h1>
		<button type="button" class="bracket-link text-xs" onclick={printPage}
			>[Print / PDF]</button
		>
	</div>
	<p class="text-xs text-gray-500 mb-3">
		What-if scenarios over your live data — {data.taxYearLabel} · {data.band} band ·
		PSA {formatCurrency(data.psaAllowanceInCents)} · tax on over-allowance interest
		{bandRate}%
	</p>

	<div class="grid gap-3 lg:grid-cols-2 max-w-6xl">
		<!-- ═══ Tool 1: rate-change what-if ═══ -->
		<section class="chart-panel">
			<div class="chart-panel-title"><span>Rate-change what-if</span></div>
			<div class="p-2 flex flex-col gap-2">
				{#if taxableSavings.length === 0}
					<p class="text-xs text-gray-500 text-center py-2">
						[no taxable savings accounts with balances]
					</p>
				{:else}
					{#each taxableSavings as a (a.slug)}
						<label class="flex items-center gap-2 text-xs">
							<span class="w-32 truncate shrink-0" title={a.name}>{a.name}</span>
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
									? 'text-gray-400'
									: deltaFor(a.slug) > 0
										? 'text-green-700'
										: 'text-red-700'}"
							>
								{deltaFor(a.slug) > 0 ? "+" : ""}{deltaFor(a.slug) / 100}%
							</span>
						</label>
					{/each}
					<div class="border-t border-gray-200 pt-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
						<span class="text-gray-500">yearly taxable interest</span>
						<span class="text-right"
							>{formatCurrency(baselineYearlyTaxable)} →
							<span class="font-bold">{formatCurrency(scenarioYearlyTaxable)}</span></span
						>
						<span class="text-gray-500">tax above PSA</span>
						<span class="text-right"
							>{formatCurrency(baselineTax)} →
							<span class="font-bold {scenarioTax > baselineTax ? 'text-red-700' : 'text-green-700'}"
								>{formatCurrency(scenarioTax)}</span
							></span
						>
					</div>
				{/if}
			</div>
			<div class="chart-panel-summary">
				{#if taxableSavings.length > 0}
					Rates ±2% per account · taxable interest {formatCurrency(baselineYearlyTaxable)} →
					{formatCurrency(scenarioYearlyTaxable)} · tax {formatCurrency(baselineTax)} →
					{formatCurrency(scenarioTax)} ({data.band} band, PSA
					{formatCurrency(data.psaAllowanceInCents)})
				{:else}Add savings accounts with balances to use this tool.{/if}
			</div>
		</section>

		<!-- ═══ Tool 2: overpayment simulator ═══ -->
		<section class="chart-panel">
			<div class="chart-panel-title"><span>Overpayment simulator</span></div>
			<div class="p-2 flex flex-col gap-2">
				{#if !debt}
					<p class="text-xs text-gray-500 text-center py-2">
						[no debt goals with linked accounts]
					</p>
				{:else}
					<div class="flex items-center gap-2 text-xs">
						<span class="text-gray-500">DEBT</span>
						<select
							class="border border-black bg-white px-1 py-0.5 text-xs flex-1"
							aria-label="Debt goal"
							bind:value={selectedDebt}
						>
							{#each data.debtGoals as d, i (d.goalId)}
								<option value={i}>{d.name} — {formatCurrency(d.balanceInCents)}</option>
							{/each}
						</select>
					</div>
					<label class="flex items-center gap-2 text-xs">
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
					<div class="border-t border-gray-200 pt-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
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
						<span class="text-gray-500">interest paid</span>
						<span class="text-right"
							>{minScenario?.totalInterestInCents == null
								? "never (payment below interest)"
								: formatCurrency(minScenario.totalInterestInCents)} →
							<span class="font-bold text-green-700"
								>{extraScenario?.totalInterestInCents == null
									? "—"
									: formatCurrency(extraScenario.totalInterestInCents)}</span
							></span
						>
						<span class="text-gray-500">saved</span>
						<span class="text-right font-bold">
							{monthsSaved != null ? `${monthsSaved} months · ` : ""}
							{interestSaved != null && interestSaved > 0
								? formatCurrency(interestSaved)
								: "—"}
						</span>
					</div>
				{/if}
			</div>
			<div class="chart-panel-summary">
				{#if debt}
					{debt.name}: +£{extraMonthly}/mo on top of
					{formatCurrency(debt.minimumMonthlyInCents)} minimums
					{debt.aprBasisPoints
						? `at ${(debt.aprBasisPoints / 100).toFixed(2)}% APR`
						: "(no APR recorded — straight-line)"}
					{interestSaved != null && interestSaved > 0
						? `saves ${formatCurrency(interestSaved)} interest`
						: ""}
				{:else}Link debt goals to accounts to use this tool.{/if}
			</div>
		</section>

		<!-- ═══ Tool 3: ISA optimiser ═══ -->
		<section class="chart-panel">
			<div class="chart-panel-title"><span>ISA optimiser</span></div>
			<div class="p-2 flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs">
					<span class="w-32 shrink-0 text-gray-500">move to ISA</span>
					<span class="w-20 shrink-0">£{isaMove.toLocaleString()}</span>
					<input
						type="range"
						min="0"
						max={Math.floor(data.isaRoomInCents / 100)}
						step="100"
						bind:value={isaMove}
						aria-label="Pounds to move from taxable savings into an ISA"
					/>
				</label>
				<div class="border-t border-gray-200 pt-2 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
					<span class="text-gray-500">forecast taxable ({data.taxYearLabel})</span>
					<span class="text-right"
						>{formatCurrency(data.forecastTaxableInterestInCents)}</span
					>
					<span class="text-gray-500">tax today</span>
					<span class="text-right">{formatCurrency(taxSavedNow)}</span>
					<span class="text-gray-500">tax after move</span>
					<span class="text-right"
						>{formatCurrency(Math.max(0, taxSavedNow - taxSavedAfterMove))}</span
					>
					<span class="text-gray-500">saved</span>
					<span class="text-right font-bold text-green-700"
						>{formatCurrency(taxSavedAfterMove)}</span
					>
				</div>
			</div>
			<div class="chart-panel-summary">
				Moving £{isaMove.toLocaleString()} from taxable savings (avg
				{(avgTaxableRateBp() / 100).toFixed(2)}%) into an ISA removes its interest
				from the {data.band}-band PSA maths — saves
				{formatCurrency(taxSavedAfterMove)} tax. ISA room shown as the full
				{formatCurrency(data.isaRoomInCents)} allowance (per-year subscriptions not
				tracked).
			</div>
		</section>

		<!-- ═══ Tool 4: savings compound projector ═══ -->
		<section class="chart-panel">
			<div class="chart-panel-title"><span>Savings compound projector</span></div>
			<div class="p-2 flex flex-col gap-2">
				<div class="grid grid-cols-2 gap-2 text-xs">
					<label class="flex items-center gap-2"
						><span class="text-gray-500 w-20 shrink-0">start £</span>
						<input
							class="border border-black w-24 px-1"
							type="number"
							min="0"
							bind:value={compoundPrincipal}
					/></label>
					<label class="flex items-center gap-2"
						><span class="text-gray-500 w-20 shrink-0">monthly £</span>
						<input
							class="border border-black w-24 px-1"
							type="number"
							min="0"
							bind:value={compoundMonthly}
					/></label>
					<label class="flex items-center gap-2"
						><span class="text-gray-500 w-20 shrink-0">rate %</span>
						<input
							class="border border-black w-24 px-1"
							type="number"
							min="0"
							max="15"
							step="0.1"
							value={compoundRatePct}
							oninput={(e) =>
								(compoundRatePct = Number((e.target as HTMLInputElement).value))}
					/></label>
					<label class="flex items-center gap-2"
						><span class="text-gray-500 w-20 shrink-0">years</span>
						<input
							class="border border-black w-24 px-1"
							type="number"
							min="1"
							max="40"
							bind:value={compoundYears}
					/></label>
				</div>
				<!-- compact sparkline-style projection line -->
				<svg
					viewBox="0 0 600 120"
					class="w-full mt-1"
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
				<div class="text-xs grid grid-cols-2 gap-x-4 gap-y-1">
					<span class="text-gray-500">after {compoundYears}y</span>
					<span class="text-right font-bold"
						>{formatCurrency(compoundFinal.balancePence)}</span
					>
					<span class="text-gray-500">contributed</span>
					<span class="text-right"
						>{formatCurrency(compoundFinal.contributedPence)}</span
					>
					<span class="text-gray-500">interest earned</span>
					<span class="text-right font-bold text-green-700"
						>{formatCurrency(compoundFinal.interestPence)}</span
					>
				</div>
			</div>
			<div class="chart-panel-summary">
				£{compoundPrincipal.toLocaleString()} + £{compoundMonthly}/mo at
				{compoundRatePct}% monthly-compounded →
				{formatCurrency(compoundFinal.balancePence)} in {compoundYears} years
				({formatCurrency(compoundFinal.contributedPence)} contributed,
				{formatCurrency(compoundFinal.interestPence)} interest). Solid line: balance;
				dashed: contributions.
			</div>
		</section>
	</div>
</div>
