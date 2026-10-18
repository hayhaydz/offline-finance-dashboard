<script lang="ts">
	import { enhance } from '$app/forms';
	import SubmitFeedback from '$lib/components/SubmitFeedback.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();

	const monthFeedback = useSubmitFeedback();
	const rangeFeedback = useSubmitFeedback();

	// Currently selected month for the edit panel (sparse entry)
	let selectedMonth = $state<string | null>(null);
	let editAmount = $state('');
	let editNote = $state('');

	const MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

	type MonthCell = { month: string; amountInCents: number | null; note: string | null };

	function findCell(month: string): MonthCell | null {
		for (const year of data.grid) {
			const cell = year.months.find((m) => m.month === month);
			if (cell) return cell;
		}
		return null;
	}

	function selectMonth(month: string) {
		if (selectedMonth === month) {
			selectedMonth = null;
			return;
		}
		selectedMonth = month;
		const cell = findCell(month);
		editAmount =
			cell?.amountInCents !== null && cell?.amountInCents !== undefined
				? (cell.amountInCents / 100).toFixed(2)
				: '';
		editNote = cell?.note ?? '';
	}

	function yearTotal(months: MonthCell[]): number {
		return months.reduce((sum, m) => sum + (m.amountInCents ?? 0), 0);
	}

	// Range-fill state (kept across the confirmation round-trip)
	let rangeFrom = $state('');
	let rangeTo = $state('');
	let rangeAmount = $state('');

	const confirmRangeFill = $derived(
		form && 'confirmRangeFill' in form
			? (form.confirmRangeFill as { count: number; fromMonth: string; toMonth: string })
			: null
	);
</script>

<main>
	<!-- HEADER -->
	<div class="flex justify-between items-center border-b border-black p-2 bg-gray-100">
		<span class="font-bold">INCOME HISTORY</span>
		<a href="/overview/tax" class="bracket-link text-xs">[Tax]</a>
	</div>

	<!-- ═══ RANGE FILL ═══ -->
	<section class="border-b border-black">
		<div class="font-bold bg-gray-50 border-b border-gray-300 p-2">RANGE FILL</div>

		<SubmitFeedback message={rangeFeedback.message} onDismiss={rangeFeedback.dismiss} />

		<form
			method="POST"
			action="?/rangeFill"
			use:enhance={rangeFeedback.createEnhanceHandler('Range filled.')}
			class="p-3 flex flex-wrap gap-2 items-end"
		>
			<div>
				<label for="rf-from" class="block text-[10px] font-bold mb-1 uppercase">From</label>
				<input id="rf-from" name="fromMonth" type="month" bind:value={rangeFrom}
					class="border border-black px-1 py-1 text-xs font-mono" />
			</div>
			<div>
				<label for="rf-to" class="block text-[10px] font-bold mb-1 uppercase">To</label>
				<input id="rf-to" name="toMonth" type="month" bind:value={rangeTo}
					class="border border-black px-1 py-1 text-xs font-mono" />
			</div>
			<div>
				<label for="rf-amount" class="block text-[10px] font-bold mb-1 uppercase">&pound;/month</label>
				<input id="rf-amount" name="amount" type="text" inputmode="numeric" placeholder="3200.00"
					bind:value={rangeAmount} class="border border-black px-1 py-1 text-xs font-mono w-24" />
			</div>
			<button type="submit" class="bracket-link text-xs">[Fill Range]</button>
		</form>

		{#if confirmRangeFill}
			<div class="bg-red-100 border-t border-black p-3 text-xs flex flex-wrap gap-2 items-center">
				<span class="font-bold">
					Overwrite {confirmRangeFill.count} existing entr{confirmRangeFill.count === 1 ? 'y' : 'ies'}
					in {confirmRangeFill.fromMonth} &rarr; {confirmRangeFill.toMonth}?
				</span>
				<form
					method="POST"
					action="?/rangeFill"
					use:enhance={rangeFeedback.createEnhanceHandler('Range filled (existing entries overwritten).')}
					class="flex gap-2"
				>
					<input type="hidden" name="fromMonth" value={confirmRangeFill.fromMonth} />
					<input type="hidden" name="toMonth" value={confirmRangeFill.toMonth} />
					<input type="hidden" name="amount" value={rangeAmount} />
					<input type="hidden" name="confirmed" value="yes" />
					<button type="submit" class="bracket-link text-xs text-red-700">[Confirm Overwrite]</button>
				</form>
				<span class="text-gray-600">(reload the page to cancel)</span>
			</div>
		{/if}

		<p class="text-[10px] text-gray-600 px-3 py-2">
			A present row means the month is known (including &pound;0). A missing row means unknown —
			never zero by default.
		</p>
	</section>

	<!-- ═══ YEAR × MONTH GRID ═══ -->
	<section class="border-b border-black">
		<div class="font-bold bg-gray-50 border-b border-gray-300 p-2">
			GRID <span class="text-xs text-gray-600 font-normal">(click a month to edit)</span>
		</div>

		<SubmitFeedback message={monthFeedback.message} onDismiss={monthFeedback.dismiss} />

		<div class="overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="border-b border-black">
						<th class="pl-3 text-left uppercase text-[10px]">Year</th>
						{#each MONTH_LABELS as label}
							<th class="text-center uppercase text-[10px]">{label}</th>
						{/each}
						<th class="text-right pr-3 uppercase text-[10px]">Known</th>
					</tr>
				</thead>
				<tbody>
					{#each data.grid as year (year.taxYear)}
						<tr class="border-b border-gray-200">
							<td class="pl-3 py-1.5 text-xs font-mono whitespace-nowrap">{year.taxYear}</td>
							{#each year.months as cell (cell.month)}
								<td class="py-1.5 text-center">
									<button
										type="button"
										onclick={() => selectMonth(cell.month)}
										class="px-1.5 py-0.5 text-[11px] font-mono min-w-12 border
											{selectedMonth === cell.month ? 'bg-black text-white border-black' :
												cell.amountInCents === null ? 'text-gray-400 border-transparent hover:border-black' :
												'border-gray-300 hover:border-black'}"
										title={cell.note ?? cell.month}
									>
										{#if cell.amountInCents === null}
											&middot;
										{:else if cell.amountInCents === 0}
											<span class="font-bold">0</span>
										{:else}
											{(cell.amountInCents / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}
										{/if}
									</button>
								</td>
							{/each}
							<td class="text-right pr-3 text-[11px] font-mono whitespace-nowrap">
								{year.months.filter((m) => m.amountInCents !== null).length}/12
								&middot; {formatCurrency(yearTotal(year.months))}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Single-month edit panel (sparse entry) -->
		{#if selectedMonth}
			<div class="border-t border-black bg-gray-50 p-3">
				<div class="text-xs font-bold mb-2 font-mono">{selectedMonth}</div>
				<form
					method="POST"
					action="?/saveMonth"
					use:enhance={monthFeedback.createEnhanceHandler('Month saved.')}
					class="flex flex-wrap gap-2 items-end"
				>
					<input type="hidden" name="month" value={selectedMonth} />
					<div>
						<label for="m-amount" class="block text-[10px] font-bold mb-1 uppercase">Gross income (&pound;)</label>
						<input
							id="m-amount"
							name="amount"
							type="text"
							inputmode="numeric"
							placeholder="0.00"
							bind:value={editAmount}
							class="border border-black px-1 py-1 text-xs font-mono w-24"
						/>
					</div>
					<div>
						<label for="m-note" class="block text-[10px] font-bold mb-1 uppercase">Note (optional)</label>
						<input
							id="m-note"
							name="note"
							type="text"
							placeholder="salary change"
							bind:value={editNote}
							class="border border-black px-1 py-1 text-xs font-mono w-44"
						/>
					</div>
					<button type="submit" class="bracket-link text-xs">[Save Month]</button>
				</form>
				<form
					method="POST"
					action="?/removeMonth"
					use:enhance={monthFeedback.createEnhanceHandler('Month removed (now unknown).')}
					class="mt-2 inline"
				>
					<input type="hidden" name="month" value={selectedMonth} />
					<button type="submit" class="bracket-link text-xs text-red-700">[Remove Entry]</button>
				</form>
				<p class="text-[10px] text-gray-600 mt-1">
					&pound;0 is a known zero-income month — distinct from removing the entry (unknown).
				</p>
			</div>
		{/if}
	</section>
</main>
