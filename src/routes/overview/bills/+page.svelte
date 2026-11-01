<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';

	// R25: bills as detected recurring patterns — summary strip + table.
	// Every row is backed by ≥ 3 real payments (28–35d cadence, ±10% amount).

	let { data } = $props();

	const sorted = $derived(
		[...data.patterns].sort((a, b) => b.amountPence - a.amountPence),
	);
</script>

<!-- v3.1 border unification: inset panel frame -->
<div class="p-2 flex flex-col gap-2">

<div class="flex justify-between items-center border border-black p-2 bg-gray-100">
	<h1 class="text-base font-bold m-0">BILLS — RECURRING MONEY OUT</h1>
	<a href="/overview" class="bracket-link text-xs">Overview</a>
</div>

<!-- summary strip -->
<div class="border border-black grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-300">
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Recurring bills</div>
		<div class="text-sm font-bold">{data.patterns.length}</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Per month</div>
		<div class="text-sm font-bold">{formatCurrency(data.monthlyTotalPence)}</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Per year</div>
		<div class="text-sm font-bold">{formatCurrency(data.yearlyTotalPence)}</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Next due</div>
		<div class="text-sm font-bold">
			{#if sorted.some((p) => p.nextDate)}
				{[...sorted].filter((p) => p.nextDate).sort((a, b) => (a.nextDate! < b.nextDate! ? -1 : 1))[0].nextDate}
			{:else}
				—
			{/if}
		</div>
	</div>
</div>

{#if sorted.length === 0 && data.emerging.length === 0}
	<div class="p-3 text-xs text-gray-600">
		No recurring payment patterns detected yet — the detector needs at least 3
		similar withdrawals on a monthly cadence (28–35 days, amounts within ±10%).
	</div>
{:else}
	{#if sorted.length === 0 && data.emerging.length > 0}
		<div class="p-3 text-xs text-gray-600 border-b border-gray-200">
			No confirmed bills yet — but {data.emerging.length}
			payment{data.emerging.length !== 1 ? 's' : ''} below look{data.emerging.length !== 1 ? '' : 's'} monthly.
		</div>
	{/if}
	{#if sorted.length > 0}
	<div class="border border-black overflow-x-auto">
		<table class="w-full text-xs">
			<thead>
				<tr class="bg-gray-100 border-b border-black">
					<th class="text-left px-1 py-0.5">Bill</th>
					<th class="text-right px-1 py-0.5">Amount</th>
					<th class="text-right px-1 py-0.5 pr-2">Per year</th>
					<!-- v3.1 A06 craft: hairline rule at the numeric→date boundary —
					     8px of padding read as one merged "Yearly Last paid" column -->
					<th class="text-left px-1 py-0.5 border-l border-gray-300">Last paid</th>
					<th class="text-left px-1 py-0.5">Next (60d)</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as bill (bill.description)}
					<tr class="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
						<td class="px-1 py-0.5">{bill.description}</td>
						<td class="px-1 py-0.5 text-right tabular-nums font-bold">{formatCurrency(bill.amountPence)}</td>
						<td class="px-1 py-0.5 text-right tabular-nums text-gray-600 pr-2">{formatCurrency(bill.amountPence * 12)}</td>
						<td class="px-1 py-0.5 tabular-nums text-gray-600 border-l border-gray-300">{bill.lastDate}</td>
						<td class="px-1 py-0.5 tabular-nums {bill.nextDate ? 'font-bold' : 'text-gray-600'}">{bill.nextDate ?? '—'}</td>
					</tr>
				{/each}
				<tr class="bg-gray-50 border-t border-black">
					<td class="px-1 py-0.5 font-bold uppercase text-xs">Total</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold">{formatCurrency(data.monthlyTotalPence)}</td>
					<td class="px-1 py-0.5 text-right tabular-nums font-bold">{formatCurrency(data.yearlyTotalPence)}</td>
					<td colspan="2"></td>
				</tr>
			</tbody>
		</table>
	</div>
	{/if}
	{#if data.emerging.length > 0}
	<!-- R-H15: watchlist — two occurrences on a monthly cadence; a third
	     matching payment promotes these to confirmed bills -->
	<div class="border border-black">
		<div class="bg-gray-50 border-b border-gray-300 px-2 py-1 text-xs font-bold" title="Candidates: payments seen twice on a monthly cadence. A third occurrence confirms them as bills.">
			EMERGING — {data.emerging.length} candidate{data.emerging.length !== 1 ? 's' : ''} · confirmed at 3 occurrences
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-xs">
				<thead>
					<tr class="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
						<th class="text-left px-1 py-0.5" scope="col">Candidate</th>
						<th class="text-right px-1 py-0.5" scope="col">Amount</th>
						<th class="text-left px-1 py-0.5" scope="col">Seen</th>
						<th class="text-left px-1 py-0.5" scope="col">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.emerging as c (c.description)}
						<tr class="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
							<td class="px-1 py-0.5">{c.description}</td>
							<td class="px-1 py-0.5 text-right tabular-nums text-gray-600">~{formatCurrency(c.amountPence)}</td>
							<td class="px-1 py-0.5 tabular-nums text-gray-600">{c.firstDate} → {c.lastDate}</td>
							<td class="px-1 py-0.5 text-amber-700 font-bold" title="Provisional: two occurrences so far — a third on the monthly cadence confirms it as a bill">watching</td>
						</tr>
					{/each}
					<tr class="bg-gray-50 border-t border-gray-300">
						<td class="px-1 py-0.5 font-bold" colspan="3">adds if all confirm</td>
						<td class="px-1 py-0.5 text-right tabular-nums font-bold">
							+{formatCurrency(data.emerging.reduce((s, c) => s + c.amountPence, 0))}/mo
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
	{/if}
	<p class="text-[10px] text-gray-600 px-2 py-1">
		Derived from your actual payments — confirmed bills need three real withdrawals on a
		monthly cadence; watchlist rows are provisional at two (one more confirms them). No bill
		list to maintain; when a payment changes, the pattern follows within a cycle. This is the
		direct-debit AND billed-as-invoiced view unified: money that leaves regularly, whatever
		the mechanism.
	</p>
{/if}
</div>
