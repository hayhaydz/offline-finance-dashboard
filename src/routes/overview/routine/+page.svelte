<script lang="ts">
	import { formatYearMonth, CHECKLIST_ITEMS } from '$lib/utils/reviews';

	let { data } = $props();
	const { history, streak, thisMonth } = $derived(data);

	// v3.1: fill month GAPS with explicit "NO REVIEW" rows — the index used
	// to jump Mar→Oct silently, contradicting the streak it displays
	type Row = (typeof history)[number] & { isGap?: boolean };
	const historyWithGaps: Row[] = $derived.by(() => {
		if (history.length < 2) return history;
		const out: Row[] = [history[0]];
		const totalItems = CHECKLIST_ITEMS.length;
		for (let i = 1; i < history.length; i++) {
			let [y, m] = history[i - 1].yearMonth.split('-').map(Number);
			for (let steps = 0; steps < 12; steps++) {
				m -= 1;
				if (m === 0) { m = 12; y -= 1; }
				if (`${y}-${String(m).padStart(2, '0')}` === history[i].yearMonth) break;
				out.push({
					yearMonth: `${y}-${String(m).padStart(2, '0')}`,
					label: formatYearMonth(`${y}-${String(m).padStart(2, '0')}`),
					completedCount: 0,
					totalItems,
					isComplete: false,
					notes: null,
					isGap: true,
				} as Row);
			}
			out.push(history[i]);
		}
		return out;
	});
</script>

<!-- v3.1 border unification: inset panel frame -->
<div class="p-2 flex flex-col gap-2">

<!-- Header -->
<div class="font-bold flex justify-between items-center bg-gray-100 border border-black p-2">
	<span>MONTHLY REVIEW</span>
</div>

<!-- SUMMARY STRIP (v3.1 A06: 5 cells; the old STREAK banner above was
     killed — it duplicated these cells (banned-pattern #4 inverse) and
     carried exactly one unique datum, now the Last active cell) -->
<div class="border border-black grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-300">
	<div class="px-2 py-1.5">
		<!-- v3.1: "Current" lied after a gap — the streak ends at the last
		     active month; state which month it ended at -->
		<div class="text-[10px] uppercase font-bold text-gray-600">
			{streak.lastActiveMonth === thisMonth ? 'Current streak' : 'Last streak'}
		</div>
		<div class="text-sm font-bold {streak.currentStreak > 0 ? 'text-green-700' : 'text-gray-400'}">
			{streak.currentStreak} month{streak.currentStreak === 1 ? '' : 's'}
		</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Longest</div>
		<div class="text-sm font-bold">{streak.longestStreak} month{streak.longestStreak === 1 ? '' : 's'}</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">This month</div>
		<div class="text-sm font-bold">
			{#if history[0]?.yearMonth === thisMonth}
				{history[0].completedCount}/{history[0].totalItems}
				{#if history[0].isComplete}<span class="text-green-700">DONE</span>{/if}
			{:else}
				<span class="text-amber-700">not started</span>
			{/if}
		</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Last active</div>
		<div class="text-sm font-bold">
			{#if streak.lastActiveMonth}
				<span title="A month counts as active when at least one item is ticked — partial months keep the streak alive">{formatYearMonth(streak.lastActiveMonth)}</span>
			{:else}
				<span class="text-gray-400">never</span>
			{/if}
		</div>
	</div>
	<div class="px-2 py-1.5">
		<div class="text-[10px] uppercase font-bold text-gray-600">Action</div>
		<a href="/overview/routine/{thisMonth}" class="bracket-link text-xs">
			{thisMonth === (history[0]?.yearMonth ?? '') ? 'Continue' : 'Start'} {formatYearMonth(thisMonth)}
		</a>
	</div>
</div>

<!-- Checklist reference (R29: a grid of cells, not a wrapped blob) -->
<div class="border border-black p-2">
	<div class="text-[10px] font-bold text-gray-500 uppercase mb-1">Checklist ({CHECKLIST_ITEMS.length} items)</div>
	<div class="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
		{#each CHECKLIST_ITEMS as item (item.key)}
			<div class="border border-black px-1 py-0.5 text-xs flex items-baseline gap-1.5">
				<span class="font-bold text-gray-500">{item.key}</span>
				<span class="text-gray-700">{item.label}</span>
			</div>
		{/each}
	</div>
</div>

<!-- History table -->
{#if history.length === 0}
	<div class="p-2 text-sm text-gray-500">
		No reviews yet. <a href="/overview/routine/{thisMonth}" class="bracket-link">Start your first review</a>
	</div>
{:else}
	<table>
		<thead>
			<tr>
				<th class="pl-2 text-left">Month</th>
				<th class="text-center">Done</th>
				<th class="text-center">Status</th>
				<th class="text-left pl-2">Notes</th>
			</tr>
		</thead>
		<tbody>
			{#each historyWithGaps as entry}
				{#if entry.isGap}
					<!-- v3.1: months with NO review render as honest gap rows — an
					     index that jumps Mar→Oct silently contradicts the streak -->
					<tr class="border-t border-gray-100 text-gray-400">
						<td class="pl-2 py-1">{entry.label}</td>
						<td class="text-center tabular-nums py-1">0/{entry.totalItems}</td>
						<td class="text-center py-1" title="No review was recorded for this month">NO REVIEW</td>
						<td class="pl-2 py-1 text-xs">—</td>
					</tr>
				{:else}
				<tr class="border-t border-gray-100 hover:bg-gray-50 transition-colors duration-150">
					<td class="pl-2 py-1 font-bold">
						<a href="/overview/routine/{entry.yearMonth}" class="bracket-link">{entry.label}</a>
					</td>
					<td class="text-center tabular-nums py-1">
						<span
							class:text-green-700={entry.isComplete}
							class:text-amber-700={entry.completedCount > 0 && !entry.isComplete}
							class:text-gray-500={entry.completedCount === 0}
						>
							{entry.completedCount}/{entry.totalItems}
						</span>
					</td>
					<td class="text-center py-1">
						{#if entry.isComplete}
							<span class="text-green-700 font-bold">DONE</span>
						{:else if entry.completedCount > 0}
							<span class="text-amber-700 font-bold">PARTIAL</span>
						{:else}
							<span class="text-gray-500" title="Not started yet">PENDING</span>
						{/if}
					</td>
					<td class="pl-2 py-1 text-xs text-gray-500 max-w-xs truncate">
						{entry.notes ?? '—'}
					</td>
				</tr>
				{/if}
			{/each}
		</tbody>
	</table>
{/if}
</div>
