<script lang="ts">
	import { browser } from '$app/environment';
	import { BarChart } from 'layerchart';
	import ChartPanel from '$lib/components/charts/ChartPanel.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import { TRANSACTION_TYPE_LABELS } from '$lib/utils/domain-constants';
	import type { AmendmentTimelineEntry } from '$lib/types/budget';

	/**
	 * Budget history + YEARLY OVERVIEW (v3.1 row 37): the year view shows
	 * each month's spend against its target as interactive bars coloured
	 * by verdict (met / near / over) with the target line drawn in — the
	 * meeting-or-not story at a glance, statement cadence included (each
	 * month is a statement period, not live data).
	 */
	let { data } = $props();

	let tableRef = $state<HTMLElement | null>(null);
	let timelineOpen = $state(false);
	let selectedYear = $state<string>('');

	const pagination = useUrlPagination('page');

	$effect(() => {
		pagination.page = data.pagination.page;
		if (!selectedYear && data.years.length > 0) selectedYear = data.years[0].year;
	});

	function compactPence(pence: number): string {
		return `£${Math.round(Math.abs(pence) / 100).toLocaleString('en-GB')}`;
	}

	function monthShort(monthStr: string): string {
		const [y, m] = monthStr.split('-');
		return new Date(Number(y), Number(m) -  1).toLocaleDateString('en-GB', { month: 'short' });
	}

	// verdict colouring: over = red, within 5% of target = amber, met = green
	function verdict(target: number, actual: number): 'met' | 'near' | 'over' | 'none' {
		if (target === 0) return 'none';
		const pct = actual / target;
		if (pct > 1) return 'over';
		if (pct >= 0.95) return 'near';
		return 'met';
	}
	const VERDICT_COLOUR: Record<string, string> = { met: '#15803d', near: '#b45309', over: '#b91c1c', none: '#e5e7eb' };
	const VERDICT_LABEL: Record<string, string> = { met: 'met', near: 'cutting it close', over: 'over', none: 'no target' };

	const activeYear = $derived(data.years.find((y) => y.year === selectedYear) ?? data.years[0] ?? null);

	const chartRows = $derived.by(() => {
		if (!activeYear) return [];
		return activeYear.months.map((m) => ({
			month: monthShort(m.month),
			spent: m.actualSpent,
			target: m.totalTarget,
			verdict: verdict(m.totalTarget, m.actualSpent),
		}));
	});

	const yearStats = $derived.by(() => {
		if (!activeYear) return null;
		const withTarget = activeYear.months.filter((m) => m.totalTarget > 0);
		const spent = activeYear.months.reduce((s, m) => s + m.actualSpent, 0);
		const target = activeYear.months.reduce((s, m) => s + m.totalTarget, 0);
		const met = withTarget.filter((m) => verdict(m.totalTarget, m.actualSpent) === 'met').length;
		const over = withTarget.filter((m) => verdict(m.totalTarget, m.actualSpent) === 'over').length;
		const maxTarget = Math.max(...activeYear.months.map((m) => m.totalTarget), 1);
		return { spent, target, met, over, months: withTarget.length, maxTarget };
	});

	const summary = $derived(
		!activeYear
			? 'No budget history yet'
			: `${activeYear.year}: ${yearStats?.met}/${yearStats?.months} months met · ${yearStats?.over} over · ${formatCurrency(yearStats!.spent)} spent of ${formatCurrency(yearStats!.target)} targeted · hover a month for detail`,
	);

	function getMonthLabel(monthStr: string): string {
		const [y, m] = monthStr.split('-');
		const date = new Date(Number(y), Number(m) - 1);
		return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
	}

	function getStatusLabel(target: number, actual: number): { label: string; class: string } {
		if (target === 0) return { label: '—', class: 'text-gray-500' };
		const pct = Math.round((actual / target) * 100);
		if (pct > 100) return { label: `OVER +${pct - 100}%`, class: 'text-red-700 font-bold' };
		if (pct >= 95) return { label: `UNDER -${100 - pct}%`, class: 'text-amber-700 font-bold' };
		return { label: `UNDER -${100 - pct}%`, class: 'text-green-700 font-bold' };
	}

	function formatAmendmentValue(field: string, value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (field === 'totalTargetInCents' || field.startsWith('categoryTarget:')) {
			return formatCurrency(Number(value));
		}
		if (Array.isArray(value)) {
			if (field === 'excludedTypes') {
				return value.length === 0 ? '(none)' : value.map((t) => TRANSACTION_TYPE_LABELS[t as keyof typeof TRANSACTION_TYPE_LABELS] ?? t).join(', ');
			}
			return value.length === 0 ? '(none)' : `${value.length} excluded`;
		}
		return String(value);
	}

	function amendmentFieldLabel(field: string): string {
		if (field.startsWith('categoryTarget:')) return 'Category target';
		switch (field) {
			case 'totalTargetInCents': return 'Total target';
			case 'excludedCategoryIds': return 'Excluded categories';
			case 'excludedAccountIds': return 'Excluded accounts';
			case 'excludedTypes': return 'Excluded types';
			default: return field;
		}
	}

	function formatAmendmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		});
	}

	type YearGroup = { year: string; entries: AmendmentTimelineEntry[] };
	let yearGroups = $derived.by(() => {
		const groups = new Map<string, AmendmentTimelineEntry[]>();
		for (const entry of data.amendmentTimeline) {
			const year = entry.month.split('-')[0];
			const list = groups.get(year) ?? [];
			list.push(entry);
			groups.set(year, list);
		}
		return [...groups.entries()]
			.sort((a, b) => Number(b[0]) - Number(a[0]))
			.map(([year, entries]): YearGroup => ({ year, entries }));
	});
</script>

<div class="bg-gray-100 p-2 font-bold border-b border-black flex justify-between items-center">
	<span>BUDGET HISTORY</span>
	<a href="/overview/budgets" class="bracket-link text-xs">Current Month</a>
</div>

<!-- ═══ YEARLY OVERVIEW (row 37) ═══ -->
{#if data.years.length > 0}
	<div class="border-b border-black">
		<div class="font-bold flex justify-between items-center bg-gray-50 border-b border-gray-300 p-2">
			<div class="flex items-center gap-2">
				<span class="text-xs tracking-widest uppercase">YEAR OVERVIEW</span>
				<div class="flex gap-1">
					{#each data.years as y (y.year)}
						<button
							type="button"
							class="bracket-link text-xs font-bold"
							class:bg-black={selectedYear === y.year}
							class:text-white={selectedYear === y.year}
							onclick={() => (selectedYear = y.year)}
						>
							{y.year}
						</button>
					{/each}
				</div>
			</div>
			<span class="text-[10px] text-gray-500">each month = one statement period</span>
		</div>

		{#if activeYear && yearStats}
			<!-- year strip -->
			<div class="border-b border-gray-200 grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-300">
				<div class="px-2 py-1.5">
					<div class="text-[10px] uppercase font-bold text-gray-600">Met</div>
					<div class="text-sm font-bold text-green-700">{yearStats.met}/{yearStats.months}</div>
					<div class="text-[10px] text-gray-500">months under 95%</div>
				</div>
				<div class="px-2 py-1.5">
					<div class="text-[10px] uppercase font-bold text-gray-600">Over</div>
					<div class="text-sm font-bold {yearStats.over > 0 ? 'text-red-700' : ''}">{yearStats.over}</div>
					<div class="text-[10px] text-gray-500">months over target</div>
				</div>
				<div class="px-2 py-1.5">
					<div class="text-[10px] uppercase font-bold text-gray-600">Spent</div>
					<div class="text-sm font-bold tabular-nums">{formatCurrency(yearStats.spent)}</div>
					<div class="text-[10px] text-gray-500">across the year</div>
				</div>
				<div class="px-2 py-1.5">
					<div class="text-[10px] uppercase font-bold text-gray-600">Targeted</div>
					<div class="text-sm font-bold tabular-nums">{formatCurrency(yearStats.target)}</div>
					<div class="text-[10px] text-gray-500">{yearStats.target > 0 ? `${Math.round((yearStats.spent / yearStats.target) * 100)}% of target` : 'no targets set'}</div>
				</div>
				<div class="px-2 py-1.5">
					<div class="text-[10px] uppercase font-bold text-gray-600">Verdict</div>
					<div class="text-sm font-bold {yearStats.over === 0 && yearStats.met === yearStats.months ? 'text-green-700' : 'text-amber-700'}">
						{yearStats.over === 0 && yearStats.met === yearStats.months ? 'year met' : 'mixed year'}
					</div>
					<div class="text-[10px] text-gray-500">vs statement months</div>
				</div>
			</div>

			<!-- the year chart: actual bars coloured by verdict, target as labelled ticks -->
			<ChartPanel title="Budget year — {activeYear.year}" {summary}>
				{#if browser && chartRows.length > 0}
					<div class="font-mono text-[10px] p-2" data-interactive-chart="budget-year" role="img" aria-label="Monthly spend versus target for {activeYear.year}, coloured by whether the budget was met; summary below">
						<BarChart
							data={chartRows}
							x="month"
							series={[{ key: 'spent', label: 'spent', value: 'spent', props: { stroke: '#111827', strokeWidth: 0.5 } }]}
							c="verdict"
							cRange={['met', 'near', 'over', 'none'].map((v) => VERDICT_COLOUR[v])}
							height={220}
							bandPadding={0.35}
							padding={{ top: 8, right: 16, bottom: 26, left: 52 }}
							yDomain={[0, Math.max(...chartRows.map((r) => Math.max(r.spent, r.target)), 1) * 1.08]}
							props={{
								xAxis: { format: (v: string) => String(v) },
								yAxis: { format: (v: number) => compactPence(v) },
								tooltip: {
									header: { format: (m: string) => `${activeYear.year} ${m}` },
									item: { format: (v: number) => `${formatCurrency(v)}` },
								},
							}}
						/>
					</div>
					<div class="flex flex-wrap gap-x-4 gap-y-1 px-2 pb-2 pt-1 text-[10px] text-gray-600">
						{#each ['met', 'near', 'over'] as v (v)}
							{@const count = chartRows.filter((r) => r.verdict === v).length}
							<span class="flex items-center gap-1">
								<span class="w-3 h-3 border border-gray-400" style="background: {VERDICT_COLOUR[v]}"></span>
								{VERDICT_LABEL[v]} ({count})
							</span>
						{/each}
						<span class="text-gray-400">· bar height = spend · colour = verdict vs that month's target</span>
					</div>
				{:else if chartRows.length === 0}
					<div class="text-xs text-gray-500 p-2 text-center">[no months recorded for {activeYear.year}]</div>
				{/if}
			</ChartPanel>
		{/if}
	</div>
{/if}

{#if data.months.length === 0}
	<div class="p-2 text-gray-600 text-sm">No budget history found.</div>
{:else}
	<div bind:this={tableRef}>
		<div class="font-bold text-xs bg-gray-50 border-y border-gray-300 px-2 py-1">MONTH BY MONTH</div>
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
