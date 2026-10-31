<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitFeedback from '$lib/components/SubmitFeedback.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';
	import type { PageData } from './$types';

	// R11 (v3 B10): the finder year is a CARD — verdict badge, a compact
	// label→value mini-table instead of stacked prose, and a threshold
	// bar that SHOWS where the assessment sits against the £50,270 /
	// £125,140 lines (labelled, not mystery ticks). Cards grid 2-up at
	// wide viewports (R29).

	let { data }: { data: PageData } = $props();

	const bandFeedback = useSubmitFeedback();
	const historyFeedback = useSubmitFeedback();

	// Add-band form state
	let newBand = $state('basic');
	let newEffectiveFrom = $state('');
	let newToTaxYear = $state('');

	// Close-row form state
	let closeRowId = $state<number | null>(null);

	function startClose(id: number) {
		closeRowId = closeRowId === id ? null : id;
	}

	function bandPsa(band: string): string {
		if (band === 'basic') return '£1,000 PSA';
		if (band === 'higher') return '£500 PSA';
		return '£0 PSA';
	}

	function stateClass(state: string): string {
		if (state === 'FIRM') return 'text-green-700';
		if (state === 'EXPECTED') return 'text-amber-700';
		if (state === 'BOUNDED') return 'text-amber-700';
		return 'text-gray-500';
	}

	// v3.1 third mandate: verdict vocabulary defined (was unexplained jargon)
	function stateHint(state: string): string {
		if (state === 'FIRM') return 'All 12 months known — the assessment is final for this year';
		if (state === 'EXPECTED') return 'Includes months projected from your average — the number can still move';
		if (state === 'BOUNDED') return 'Months are missing — the true value lies between the known total and the worst case';
		return 'No income data';
	}

	// Threshold bar geometry: fill = assessment / additional threshold,
	// with the higher-threshold crossing labelled below the bar.
	function barGeometry(assessment: number, higher: number, additional: number) {
		const scale = Math.max(additional, assessment, 1);
		const fillPct = Math.min(100, Math.round((assessment / scale) * 100));
		const higherPct = Math.min(100, Math.round((higher / scale) * 100));
		const overHigher = assessment >= higher;
		// v3.1 A07 harvest: the exact gap on hover (title tooltip)
		const gapToHigher = assessment >= higher ? null : higher - assessment;
		return { fillPct, higherPct, overHigher, gapToHigher };
	}
</script>

<main>
	<!-- HEADER -->
	<div class="flex justify-between items-center border border-black p-2 bg-gray-100">
		<span class="font-bold">TAX</span>
		<div class="flex gap-2">
			<a href="/overview/tax/income" class="bracket-link text-xs">Income History</a>
			<a href="/accounts/interest/all" class="bracket-link text-xs">Interest Years</a>
		</div>
	</div>

	<!-- ═══ BAND FINDER (headline) ═══ -->
	<section class="border border-black">
		<div class="font-bold flex justify-between bg-gray-50 border-b border-gray-300 p-2">
			<span>BAND FINDER</span>
			<span class="text-xs text-gray-600 font-normal">income + non-ISA interest vs thresholds</span>
		</div>

		<SubmitFeedback message={bandFeedback.message} onDismiss={bandFeedback.dismiss} />

		{#if data.finder.length === 0}
			<p class="text-xs text-gray-600 p-3">
				No income recorded yet. Start at <a href="/overview/tax/income" class="bracket-link">Income History</a> — the finder fills in from there.
			</p>
		{:else}
			<!-- R-H5: three years of cards read 3-up on wide screens (kills the
		     dead quadrant the 2-col grid left with 3 cards) -->
		<div class="grid gap-0 md:grid-cols-2 xl:grid-cols-3 md:divide-x md:divide-gray-300">
				{#each data.finder as year (year.taxYear)}
					<div class="p-2 border-b border-gray-200 flex flex-col gap-1.5">
						<!-- card header: year + verdict + suggestion -->
						<div class="flex justify-between items-baseline gap-2">
							<div class="flex items-baseline gap-2">
								<span class="font-bold font-mono">{year.taxYear}</span>
								{#if year.taxYear === data.currentTaxYear}
									<span class="text-[10px] text-gray-500">(current)</span>
								{/if}
							</div>
							<div class="flex items-baseline gap-2">
								{#if year.suggestedBand}
									<span class="text-[10px] text-gray-500">suggests</span>
									<span class="font-bold font-mono text-xs">{year.suggestedBand.toUpperCase()}</span>
								{/if}
								<!-- v3.1: verdict states defined on hover — EXPECTED/FIRM/BOUNDED
								     were guessable jargon (vision-flagged) -->
								<span class="font-bold text-xs {stateClass(year.state)}" title={stateHint(year.state)}>{year.state}</span>
							</div>
						</div>

						{#if year.state === 'UNKNOWN'}
							<p class="text-xs text-gray-500">no income data</p>
						{:else}
							<!-- threshold bar (R11: show, don't narrate) -->
							{@const geo = barGeometry(year.assessmentTotalInCents, year.higherThresholdInCents, year.additionalThresholdInCents)}
							<div>
								<div class="flex h-3 border border-black relative bg-white"
								title="Assessment {formatCurrency(year.assessmentTotalInCents)}{geo.gapToHigher !== null ? ` · ${formatCurrency(geo.gapToHigher)} below the higher-rate threshold` : ' · at or above the higher-rate threshold'} · additional-rate threshold {formatCurrency(year.additionalThresholdInCents)}"
							>
									<div class="h-full {geo.overHigher ? 'bg-amber-600' : 'bg-green-700'}" style="width: {geo.fillPct}%"></div>
									<!-- higher-rate crossing: labelled marker, not a mystery line -->
									<div class="absolute top-0 bottom-0 border-l border-black" style="left: {geo.higherPct}%"></div>
								</div>
								<div class="flex justify-between text-[10px] text-gray-500 mt-0.5 tabular-nums">
									<span>0</span>
									<span class="text-center">&uarr; higher {formatCurrency(year.higherThresholdInCents)}</span>
									<span>additional {formatCurrency(year.additionalThresholdInCents)}</span>
								</div>
							</div>

							<!-- mini-table: the arithmetic, scannable. v3.1 third mandate:
							     ANSWER FIRST — assessment + vs-threshold lead so the key rows
							     align horizontally across cards (conditional detail rows used
							     to push them to different heights per card) -->
							<div class="border border-black text-xs">
								<div class="flex justify-between border-b border-gray-200 px-1 py-0.5 bg-gray-50">
									<span class="font-bold">assessment</span>
									<span class="tabular-nums font-bold">{formatCurrency(year.assessmentTotalInCents)}</span>
								</div>
								<div class="flex justify-between border-b border-gray-200 px-1 py-0.5 {year.marginInCents >= 0 ? 'text-red-700' : 'text-green-700'}">
									<span>vs threshold</span>
									<span class="tabular-nums font-bold">
										{year.marginInCents >= 0 ? 'over by' : 'under by'} {formatCurrency(Math.abs(year.marginInCents))}
									</span>
								</div>
								<div class="flex justify-between border-b border-gray-200 px-1 py-0.5">
									<span class="text-gray-600">known income ({year.knownMonths.length}/12 mo)</span>
									<span class="tabular-nums">{formatCurrency(year.knownTotalInCents)}</span>
								</div>
								{#if year.state === 'BOUNDED'}
									<div class="flex justify-between border-b border-gray-200 px-1 py-0.5 {year.overRegardless ? 'text-red-700' : 'text-amber-700'}">
										<span>missing months</span>
										<span class="tabular-nums text-right">
											{year.missingPastMonths.length} —
											{#if year.overRegardless}
												over regardless
											{:else}
												need &ge; {formatCurrency(year.requiredAvgPerMissingMonthInCents ?? 0)}/mo to reach higher
											{/if}
										</span>
									</div>
								{/if}
								{#if year.state === 'EXPECTED' || (year.state === 'BOUNDED' && year.projectedMonths.length > 0)}
									<div class="flex justify-between border-b border-gray-200 px-1 py-0.5">
										<span class="text-gray-600">projected ({year.projectedMonths.length} mo @ {formatCurrency(year.projectionAssumptionInCents ?? 0)})</span>
										<span class="tabular-nums">{formatCurrency(year.projectedTotalInCents)}</span>
									</div>
								{/if}
								<div class="flex justify-between border-b border-gray-200 px-1 py-0.5">
									<span class="text-gray-600">interest (auto, non-ISA{#if year.interestIncludesProjection} + proj{/if})</span>
									<span class="tabular-nums">{formatCurrency(year.taxableInterestInCents)}</span>
								</div>
							</div>

							<!-- per-card controls (v3.1 A07 craft: actions grouped left with a
							     consistent gap — was justify-between, orphaning [Apply as X]) -->
							<div class="flex flex-wrap items-center gap-4">
								{#if year.state === 'EXPECTED' || (year.state === 'BOUNDED' && year.projectedMonths.length > 0)}
									<form method="GET" action="/overview/tax" class="inline-flex gap-1 items-center">
										<input type="hidden" name="assumptionYear" value={year.taxYear} />
										<label for="assumption-{year.slug}" class="text-[10px] text-gray-600">assumption &pound;/mo:</label>
										<input
											id="assumption-{year.slug}"
											name="assumption"
											type="text"
											inputmode="numeric"
											placeholder={((year.projectionAssumptionInCents ?? 0) / 100).toFixed(0)}
											class="border border-black px-1 py-0.5 text-[10px] font-mono w-16"
										/>
										<button type="submit" class="bracket-link text-[10px]">Apply</button>
									</form>
								{/if}
								{#if year.suggestedBand}
									<form
										method="POST"
										action="?/applyBand"
										use:enhance={bandFeedback.createEnhanceHandler('Band applied.')}
										class="inline"
									>
										<input type="hidden" name="taxYear" value={year.taxYear} />
										<input type="hidden" name="band" value={year.suggestedBand} />
										<button type="submit" class="bracket-link text-xs">
											Apply as {year.suggestedBand}
										</button>
									</form>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
			<p class="text-[10px] text-gray-600 px-3 py-2 border-t border-gray-200">
				Finder is an estimator — applied band rows are authoritative. Thresholds are
				per-tax-year (HMRC: &pound;50,270; additional rate &pound;125,140 from 2023/24). Tax-wrappered interest
				(ISA/LISA/premium bonds) never counts.
			</p>
		{/if}
	</section>

	<!-- ═══ BAND HISTORY ═══ -->
	<section class="border border-black">
		<div class="font-bold flex justify-between bg-gray-50 border-b border-gray-300 p-2">
			<span>BAND HISTORY</span>
			<span class="text-xs text-gray-600 font-normal">{data.bandHistory.length} row(s)</span>
		</div>

		<SubmitFeedback message={historyFeedback.message} onDismiss={historyFeedback.dismiss} />

		{#if data.bandHistory.length === 0}
			<p class="text-xs text-gray-600 p-3">
				No band history. Add a row below or apply a finder verdict above — until then the
				legacy setting is used as a fallback.
			</p>
		{:else}
			<table class="w-full">
				<thead>
					<tr class="border-b border-black">
						<th class="pl-3 text-left uppercase text-[10px]">Band</th>
						<th class="text-left uppercase text-[10px]">From</th>
						<th class="text-left uppercase text-[10px]">To</th>
						<th class="text-right pr-3 uppercase text-[10px]">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.bandHistory as row (row.id)}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="pl-3 py-1.5 text-sm font-mono">
								{row.band.toUpperCase()}
								<span class="text-[10px] text-gray-500">{bandPsa(row.band)}</span>
							</td>
							<td class="py-1.5 text-sm font-mono">{row.fromTaxYear}</td>
							<td class="py-1.5 text-sm font-mono">
								{#if row.toTaxYear === null}
									<span class="text-gray-500">open</span>
								{:else}
									{row.toTaxYear}
								{/if}
							</td>
							<td class="text-right pr-3 py-1.5 whitespace-nowrap">
								{#if row.toTaxYear === null}
									<button onclick={() => startClose(row.id)} class="bracket-link text-xs">Close</button>
								{:else}
									<form
										method="POST"
										action="?/reopenBand"
										use:enhance={historyFeedback.createEnhanceHandler('Band reopened.')}
										class="inline"
									>
										<input type="hidden" name="id" value={row.id} />
										<button type="submit" class="bracket-link text-xs">Reopen</button>
									</form>
								{/if}
								<form
									method="POST"
									action="?/deleteBand"
									use:enhance={historyFeedback.createEnhanceHandler('Band row deleted.')}
									class="inline ml-2"
								>
									<input type="hidden" name="id" value={row.id} />
									<button type="submit" class="bracket-link text-xs text-red-700">Delete</button>
								</form>

								{#if closeRowId === row.id}
									<form
										method="POST"
										action="?/closeBand"
										use:enhance={historyFeedback.createEnhanceHandler('Band closed.', { onSuccess: () => { closeRowId = null; } })}
										class="mt-1 flex gap-1 justify-end items-center"
									>
									<input type="hidden" name="id" value={row.id} />
									<label for="close-band-{row.id}" class="sr-only">Close band at tax year</label>
									<input
										id="close-band-{row.id}"
										name="toTaxYear"
										placeholder="2025/26"
										class="border border-black px-1 py-0.5 text-xs font-mono w-20"
									/>
									<button type="submit" class="bracket-link text-xs">Save</button>
									<button type="button" onclick={() => startClose(row.id)} class="bracket-link text-xs">Cancel</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		<!-- Add band form -->
		<form
			method="POST"
			action="?/addBand"
			use:enhance={historyFeedback.createEnhanceHandler('Band added.', {
				onSuccess: () => { newEffectiveFrom = ''; newToTaxYear = ''; }
			})}
			class="p-3 border-t border-gray-200 flex flex-wrap gap-2 items-end"
		>
			<div>
				<label for="new-band" class="block text-[10px] font-bold mb-1 uppercase">Band</label>
				<select
					id="new-band"
					name="band"
					bind:value={newBand}
					class="border border-black px-1 py-1 text-xs font-mono bg-white"
				>
					<option value="basic">BASIC (£1,000 PSA)</option>
					<option value="higher">HIGHER (£500 PSA)</option>
					<option value="additional">ADDITIONAL (£0 PSA)</option>
				</select>
			</div>
			<div>
				<label for="new-from" class="block text-[10px] font-bold mb-1 uppercase">Effective from</label>
				<input
					id="new-from"
					name="effectiveFrom"
					bind:value={newEffectiveFrom}
					placeholder="2026/27 or 2026-07"
					class="border border-black px-1 py-1 text-xs font-mono w-36"
				/>
			</div>
			<div>
				<label for="new-to" class="block text-[10px] font-bold mb-1 uppercase">To (optional)</label>
				<input
					id="new-to"
					name="toTaxYear"
					bind:value={newToTaxYear}
					placeholder="2027/28"
					class="border border-black px-1 py-1 text-xs font-mono w-28"
				/>
			</div>
			<button type="submit" class="bracket-link text-xs">Add Band</button>
			<p class="text-[10px] text-gray-600 w-full mt-0">
				Bands are tax-year atomic: a mid-year date (e.g. July 2026) records as "from 2026/27"
				and applies to that entire tax year, including months before the change.
			</p>
		</form>
	</section>
</main>
