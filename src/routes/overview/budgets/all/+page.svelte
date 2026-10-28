<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import { TRANSACTION_TYPE_LABELS } from '$lib/utils/domain-constants';
	import type { AmendmentTimelineEntry } from '$lib/types/budget';

	let { data } = $props();

	let tableRef = $state<HTMLElement | null>(null);
	let timelineOpen = $state(false);

	const pagination = useUrlPagination('page');

	// Sync from server data (initial + navigation)
	$effect(() => {
		pagination.page = data.pagination.page;
	});

	function getMonthLabel(monthStr: string): string {
		const [y, m] = monthStr.split("-");
		const date = new Date(Number(y), Number(m) - 1);
		return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
	}

	function getStatusLabel(target: number, actual: number): { label: string; class: string } {
		if (target === 0) return { label: "—", class: "text-gray-500" };
		const pct = Math.round((actual / target) * 100);
		if (pct > 100) return { label: `OVER +${pct - 100}%`, class: "text-red-700 font-bold" };
		if (pct >= 95) return { label: `UNDER -${100 - pct}%`, class: "text-amber-600 font-bold" };
		return { label: `UNDER -${100 - pct}%`, class: "text-green-700 font-bold" };
	}

	function formatAmendmentValue(field: string, value: unknown): string {
		if (value === null || value === undefined) return "—";
		if (field === "totalTargetInCents" || field.startsWith("categoryTarget:")) {
			return formatCurrency(Number(value));
		}
		if (Array.isArray(value)) {
			if (field === "excludedTypes") {
				return value.length === 0 ? "(none)" : value.map((t) => TRANSACTION_TYPE_LABELS[t as keyof typeof TRANSACTION_TYPE_LABELS] ?? t).join(", ");
			}
			return value.length === 0 ? "(none)" : `${value.length} excluded`;
		}
		return String(value);
	}

	function amendmentFieldLabel(field: string): string {
		if (field.startsWith("categoryTarget:")) return "Category target";
		switch (field) {
			case "totalTargetInCents": return "Total target";
			case "excludedCategoryIds": return "Excluded categories";
			case "excludedAccountIds": return "Excluded accounts";
			case "excludedTypes": return "Excluded types";
			default: return field;
		}
	}

	function formatAmendmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString("en-GB", {
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	}

	// Year groups for the amendment timeline, latest year first
	type YearGroup = { year: string; entries: AmendmentTimelineEntry[] };
	let yearGroups = $derived.by(() => {
		const groups = new Map<string, AmendmentTimelineEntry[]>();
		for (const entry of data.amendmentTimeline) {
			const year = entry.month.split("-")[0];
			const list = groups.get(year) ?? [];
			list.push(entry);
			groups.set(year, list);
		}
		// Entries arrive reverse-chronological; keep year order latest-first
		return [...groups.entries()]
			.sort((a, b) => Number(b[0]) - Number(a[0]))
			.map(([year, entries]): YearGroup => ({ year, entries }));
	});
</script>

<div class="bg-gray-100 p-2 font-bold border-b border-black flex justify-between items-center">
	<span>BUDGET HISTORY</span>
	<a href="/overview/budgets" class="bracket-link text-xs">[Current Month]</a>
</div>

{#if data.months.length === 0}
	<div class="p-2 text-gray-600 text-sm">No budget history found.</div>
{:else}
	<div bind:this={tableRef}>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr>
						<th class="text-left p-0.5 border-b border-gray-300 text-gray-500 font-normal">Month</th>
						<th class="text-right p-0.5 border-b border-gray-300 text-gray-500 font-normal">Target</th>
						<th class="text-right p-0.5 border-b border-gray-300 text-gray-500 font-normal">Actual</th>
						<th class="text-right p-0.5 border-b border-gray-300 text-gray-500 font-normal">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.months as h (h.month)}
						{@const status = getStatusLabel(h.totalTarget, h.actualSpent)}
						<tr class="border-b border-dotted border-gray-200">
							<td class="p-0.5"><a href="/overview/budgets/{h.month}" class="bracket-link">{getMonthLabel(h.month)}</a></td>
							<td class="p-0.5 text-right">{formatCurrency(h.totalTarget)}</td>
							<td class="p-0.5 text-right">{formatCurrency(h.actualSpent)}</td>
							<td class="p-0.5 text-right {status.class}">{status.label}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<PaginationClient
			page={pagination.page}
			totalPages={data.pagination.totalPages}
			onPageChange={pagination.updatePage}
			scrollTarget={tableRef}
		/>
	</div>
{/if}

<!-- AMENDMENT TIMELINE (task 4.5): cross-month, reverse-chronological, expandable -->
<button
	class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1 text-xs bg-gray-50 border-t border-black"
	onclick={() => (timelineOpen = !timelineOpen)}
>
	<span>AMENDMENT TIMELINE <span class="text-gray-500">{data.amendmentTimeline.length} change{data.amendmentTimeline.length === 1 ? '' : 's'} across {yearGroups.length} year{yearGroups.length === 1 ? '' : 's'}</span></span>
	<span class="text-xs text-gray-500">{timelineOpen ? '[-]' : '[+]'}</span>
</button>
{#if timelineOpen}
	<div class="px-2 py-1 border-b border-gray-300">
		{#if data.amendmentTimeline.length === 0}
			<div class="text-xs text-gray-500 py-1">No amendments recorded yet. Config edits are trailed automatically.</div>
		{:else}
			{#each yearGroups as group (group.year)}
				<div class="text-gray-500 font-bold text-xs py-1 {group.year === yearGroups[0].year ? '' : 'mt-2 border-t border-dotted border-gray-200'}">{group.year}</div>
				{#each group.entries as entry (entry.id)}
					<div class="flex flex-wrap items-baseline gap-x-1.5 py-0.5 border-b border-dotted border-gray-100 text-xs">
						<span class="text-gray-500 w-20 shrink-0">{formatAmendmentDate(entry.createdAt)}</span>
						<a href="/overview/budgets/{entry.month}" class="bracket-link">{getMonthLabel(entry.month)}</a>
						<span class="font-bold">{amendmentFieldLabel(entry.field)}</span>
						<span>{formatAmendmentValue(entry.field, entry.oldValue)}</span>
						<span class="text-gray-500">&rarr;</span>
						<span class="font-bold">{formatAmendmentValue(entry.field, entry.newValue)}</span>
						{#if entry.note}
							<span class="text-gray-500">({entry.note})</span>
						{/if}
					</div>
				{/each}
			{/each}
			<div class="text-[10px] text-gray-500 py-0.5">Transactions are immutable — only config changes appear here, latest first.</div>
		{/if}
	</div>
{/if}
