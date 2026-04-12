<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { formatCurrencyShorthand } from '$lib/utils/currency';
	import PaginationClient from '$lib/components/PaginationClient.svelte';

	let { data } = $props();

	let tableRef: HTMLElement | null = $state(null);
	let currentPage = $state(0);
	let isUpdatingPage = $state(false);

	async function updatePage(newPage: number) {
		if (isUpdatingPage) return;
		isUpdatingPage = true;
		currentPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('page', String(newPage + 1));
		} else {
			url.searchParams.delete('page');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingPage = false;
	}

	$effect(() => {
		if (isUpdatingPage) return;
		currentPage = data.page;
	});

	$effect(() => {
		if (isUpdatingPage) return;
		const urlPage = Number(pageState.url.searchParams.get('page')) || 1;
		if (currentPage !== urlPage - 1) {
			currentPage = urlPage - 1;
		}
	});

	const snapshotsWithTrends = $derived.by(() => {
		return data.snapshots.map((snapshot, index) => {
			if (index === data.snapshots.length - 1) {
				return { ...snapshot, trends: null };
			}
			const previous = data.snapshots[index + 1];
			const netWorthChange = snapshot.netWorthInCents - previous.netWorthInCents;
			return { ...snapshot, trends: { netWorthChange } };
		});
	});

	function getTrendArrow(change: number): string {
		if (change === 0) return '→';
		return change > 0 ? '↑' : '↓';
	}

	function getTrendColor(change: number): string {
		if (change === 0) return 'text-gray-600';
		return change > 0 ? 'text-green-700' : 'text-red-700';
	}
</script>

<!-- SNAPSHOTS LIST SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span class="text-xs text-gray-500"><span class={data.staleness.cssClass}>●</span> {data.staleness.label}</span>
	<a href="/overview/snapshots/create" class="bracket-link text-xs">+ Create Snapshot</a>
</div>

<div class="p-0">
	{#if data.snapshots.length === 0}
		<p class="text-gray-600 text-xs p-2">
			No snapshots yet. Create your first snapshot to start tracking your net worth over time.
		</p>
	{:else}
		<table bind:this={tableRef}>
			<thead>
				<tr>
					<th class="w-8 text-center border-r border-gray-200">T</th>
					<th class="pl-2 text-left">Date</th>
					<th class="text-right pr-1">Net Worth</th>
					<th class="text-right pr-1">Assets</th>
					<th class="text-right pr-1">Liabilities</th>
					<th class="text-right pr-1">MoM Change</th>
				</tr>
			</thead>
			<tbody>
				{#each snapshotsWithTrends as snapshot}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="text-center border-r border-gray-200 text-sm py-2">
							{#if snapshot.trends}
								<span class="text-xl {getTrendColor(snapshot.trends.netWorthChange)}" style="text-shadow: 0 0 1px currentColor;">
									{getTrendArrow(snapshot.trends.netWorthChange)}
								</span>
							{:else}
								<span class="text-gray-600 text-xl">→</span>
							{/if}
						</td>
						<td class="pl-2 text-sm py-2">
							<a href="/overview/snapshots/{snapshot.slug}" class="bracket-link text-xs">{snapshot.snapshotDate}</a>
						</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2">{formatCurrencyShorthand(snapshot.netWorthInCents)}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2">{formatCurrencyShorthand(snapshot.totalAssetsInCents)}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2">{formatCurrencyShorthand(snapshot.totalLiabilitiesInCents)}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2">
							{#if snapshot.trends}
								{snapshot.trends.netWorthChange >= 0 ? '+' : ''}{formatCurrencyShorthand(snapshot.trends.netWorthChange)}
							{:else}
								<span class="text-gray-600">N/A</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<PaginationClient
	page={currentPage}
	totalPages={data.totalPages}
	onPageChange={updatePage}
	scrollTarget={tableRef}
/>
