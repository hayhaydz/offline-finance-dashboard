<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitFeedback from '$lib/components/SubmitFeedback.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';
	import type { PageData } from './$types';

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
</script>

<main>
	<!-- HEADER -->
	<div class="flex justify-between items-center border-b border-black p-2 bg-gray-100">
		<span class="font-bold">TAX</span>
		<div class="flex gap-2">
			<a href="/overview/tax/income" class="bracket-link text-xs">[Income History]</a>
			<a href="/accounts/interest/all" class="bracket-link text-xs">[Interest Years]</a>
		</div>
	</div>

	<!-- ═══ BAND FINDER (headline) ═══ -->
	<section class="border-b border-black">
		<div class="font-bold flex justify-between bg-gray-50 border-b border-gray-300 p-2">
			<span>BAND FINDER</span>
			<span class="text-xs text-gray-600 font-normal">income + non-ISA interest vs thresholds</span>
		</div>

		<SubmitFeedback message={bandFeedback.message} onDismiss={bandFeedback.dismiss} />

		{#if data.finder.length === 0}
			<p class="text-xs text-gray-600 p-3">
				No income recorded yet. Start at <a href="/overview/tax/income" class="bracket-link">[Income History]</a> — the finder fills in from there.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-black">
							<th class="pl-3 text-left uppercase text-[10px]">Year</th>
							<th class="text-left uppercase text-[10px]">Verdict</th>
							<th class="text-left uppercase text-[10px]">Arithmetic</th>
							<th class="text-right pr-3 uppercase text-[10px]">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each data.finder as year (year.taxYear)}
							<tr class="border-b border-gray-200 last:border-b-0 align-top">
								<td class="pl-3 py-2 text-sm font-mono whitespace-nowrap">
									{year.taxYear}
									{#if year.taxYear === data.currentTaxYear}
										<div class="text-[10px] text-gray-500">(current)</div>
									{/if}
								</td>
								<td class="py-2 text-xs whitespace-nowrap {stateClass(year.state)}">
									<span class="font-bold">{year.state}</span>
									{#if year.suggestedBand}
										<div class="font-mono">{year.suggestedBand.toUpperCase()}</div>
									{/if}
								</td>
								<td class="py-2 text-xs font-mono">
									{#if year.state === 'UNKNOWN'}
										<span class="text-gray-500">no income data</span>
									{:else}
										<div>KNOWN {year.knownMonths.length}/12: {formatCurrency(year.knownTotalInCents)}</div>
										{#if year.state === 'BOUNDED'}
											{#if year.overRegardless}
												<div class="text-red-700">over threshold regardless of {year.missingPastMonths.length} missing month(s)</div>
											{:else}
												<div class="text-amber-700">
													{year.missingPastMonths.length} missing month(s): need &ge; {formatCurrency(year.requiredAvgPerMissingMonthInCents ?? 0)}/mo avg to reach {formatCurrency(year.targetThresholdInCents)}
												</div>
											{/if}
										{/if}
										{#if year.state === 'EXPECTED' || (year.state === 'BOUNDED' && year.projectedMonths.length > 0)}
											<div>
												PROJECTED {year.projectedMonths.length} mo @ {formatCurrency(year.projectionAssumptionInCents ?? 0)}/mo: {formatCurrency(year.projectedTotalInCents)}
												<span class="text-gray-500">(assumption)</span>
											</div>
											<!-- Editable projection assumption -->
											<form method="GET" action="/overview/tax" class="inline-flex gap-1 items-center mt-0.5">
												<input type="hidden" name="assumptionYear" value={year.taxYear} />
												<label for="assumption-{year.slug}" class="text-[10px] text-gray-600">&pound;/mo:</label>
												<input
													id="assumption-{year.slug}"
													name="assumption"
													type="text"
													inputmode="numeric"
													placeholder={((year.projectionAssumptionInCents ?? 0) / 100).toFixed(0)}
													class="border border-black px-1 py-0.5 text-[10px] font-mono w-16"
												/>
												<button type="submit" class="bracket-link text-[10px]">[Apply]</button>
											</form>
										{/if}
										<div>INTEREST (AUTO, NON-ISA{#if year.interestIncludesProjection} + PROJECTED{/if}): {formatCurrency(year.taxableInterestInCents)}</div>
										<div class="border-t border-gray-200 mt-0.5 pt-0.5">
											ASSESSMENT: <span class="font-bold">{formatCurrency(year.assessmentTotalInCents)}</span>
											vs {formatCurrency(year.higherThresholdInCents)} / {formatCurrency(year.additionalThresholdInCents)}
											&rarr; {year.marginInCents >= 0 ? 'over by' : 'under by'} {formatCurrency(Math.abs(year.marginInCents))}
										</div>
									{/if}
								</td>
								<td class="text-right pr-3 py-2 whitespace-nowrap">
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
												[Apply as {year.suggestedBand}]
											</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-[10px] text-gray-600 px-3 py-2 border-t border-gray-200">
				Finder is an estimator — applied band rows are authoritative. Thresholds are
				per-tax-year (HMRC defaults &pound;50,270 / &pound;150,000). Tax-wrappered interest
				(ISA/LISA/premium bonds) never counts.
			</p>
		{/if}
	</section>

	<!-- ═══ BAND HISTORY ═══ -->
	<section class="border-b border-black">
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
			<button type="submit" class="bracket-link text-xs">[Add Band]</button>
			<p class="text-[10px] text-gray-600 w-full mt-0">
				Bands are tax-year atomic: a mid-year date (e.g. July 2026) records as "from 2026/27"
				and applies to that entire tax year, including months before the change.
			</p>
		</form>
	</section>
</main>
