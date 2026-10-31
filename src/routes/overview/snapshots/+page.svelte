<script lang="ts">
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import { listnav } from '$lib/utils/list-nav';
	import { formatCurrencyShorthand } from '$lib/utils/currency';
	import PaginationClient from '$lib/components/PaginationClient.svelte';

	let { data } = $props();

	let tableRef: HTMLElement | null = $state(null);
	const pagination = useUrlPagination('page');

	// Sync from server data (initial + navigation)
	$effect(() => {
		pagination.page = data.page;
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

<!-- SUMMARY STRIP (R17/B12): the state of the snapshot record, at a glance -->
{#if data.snapshots.length > 0}
	{@const latest = snapshotsWithTrends[0]}
	<div class="border-b border-black grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-300">
		<div class="px-2 py-1.5">
			<div class="text-[10px] uppercase font-bold text-gray-600">Latest net worth</div>
			<div class="text-sm font-bold">{formatCurrencyShorthand(latest.netWorthInCents)}</div>
			<div class="text-[10px] text-gray-500">{latest.snapshotDate}</div>
		</div>
		<div class="px-2 py-1.5">
			<div class="text-[10px] uppercase font-bold text-gray-600">Latest change</div>
			<div class="text-sm font-bold {latest.trends ? getTrendColor(latest.trends.netWorthChange) : ''}">
				{#if latest.trends}
					{latest.trends.netWorthChange >= 0 ? '+' : ''}{formatCurrencyShorthand(latest.trends.netWorthChange)}
				{:else}
					—
				{/if}
			</div>
			<div class="text-[10px] text-gray-500">vs previous snapshot</div>
		</div>
		<div class="px-2 py-1.5">
			<div class="text-[10px] uppercase font-bold text-gray-600">Freshness</div>
			<div class="text-sm font-bold {data.staleness ? '' : 'text-gray-400'}">
				{#if data.staleness}
					<span class={data.staleness.cssClass}>●</span> {data.staleness.label}
				{:else}
					—
				{/if}
			</div>
			<div class="text-[10px] text-gray-500">page {data.page} of {data.totalPages}</div>
		</div>
		<div class="px-2 py-1.5">
			<div class="text-[10px] uppercase font-bold text-gray-600">Action</div>
			<a href="/overview/snapshots/create" class="bracket-link text-xs">+ Create Snapshot</a>
			<div class="text-[10px] text-gray-500">locks today's balances</div>
		</div>
	</div>
{/if}

<!-- SNAPSHOTS LIST SECTION (v3.1 third-mandate: the old vertical table
     never used the viewport — snapshots are RECORDS, so render them as a
     grid of statement cards, 4-wide at desktop) -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span class="text-xs text-gray-600">
			{#if data.staleness}
				<span class={data.staleness.cssClass}>●</span> {data.staleness.label}
			{:else}
				No snapshots yet
			{/if}
		</span>
	<a href="/overview/snapshots/create" class="bracket-link text-xs">+ Create Snapshot</a>
</div>

<div class="p-2">
	{#if data.snapshots.length === 0}
		<p class="text-gray-600 text-xs">
			No snapshots yet. Create your first snapshot to start tracking your net worth over time.
		</p>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2" use:listnav>
			{#each snapshotsWithTrends as snapshot (snapshot.slug)}
				{@const assetsAbs = Math.abs(snapshot.totalAssetsInCents)}
				{@const liabAbs = Math.abs(snapshot.totalLiabilitiesInCents)}
				{@const total = assetsAbs + liabAbs}
				<div
					class="border border-black flex flex-col hover:bg-gray-50 transition-colors duration-150"
					data-nav-row
				>
					<!-- date band + MoM chip -->
					<div class="flex justify-between items-center bg-gray-100 border-b border-black px-2 py-1">
						<a href="/overview/snapshots/{snapshot.slug}" class="bracket-link text-xs font-bold" data-nav-primary>{snapshot.snapshotDate}</a>
						{#if snapshot.trends}
							<span class="text-[10px] font-bold tabular-nums {getTrendColor(snapshot.trends.netWorthChange)}">
								{getTrendArrow(snapshot.trends.netWorthChange)}
								{snapshot.trends.netWorthChange >= 0 ? '+' : ''}{formatCurrencyShorthand(snapshot.trends.netWorthChange)}
							</span>
						{:else}
							<span class="text-[10px] text-gray-500">first record</span>
						{/if}
					</div>
					<!-- the headline -->
					<div class="px-2 pt-2 pb-1">
						<div class="text-[10px] uppercase font-bold text-gray-500">net worth</div>
						<div class="text-lg font-bold tabular-nums {snapshot.netWorthInCents >= 0 ? 'text-green-700' : 'text-red-700'}">
							{formatCurrencyShorthand(snapshot.netWorthInCents)}
						</div>
					</div>
					<!-- assets vs liabilities composition bar -->
					<div class="px-2 pb-2 mt-auto">
						<div class="flex h-2 border border-black" title="Assets {formatCurrencyShorthand(snapshot.totalAssetsInCents)} vs liabilities {formatCurrencyShorthand(snapshot.totalLiabilitiesInCents)}">
							{#if total > 0}
								<div class="h-full bg-green-700" style="width: {(assetsAbs / total) * 100}%"></div>
								<div class="h-full bg-red-700 flex-1"></div>
							{/if}
						</div>
						<div class="flex justify-between text-[10px] mt-1 tabular-nums">
							<span class="text-green-700 font-bold">A {formatCurrencyShorthand(snapshot.totalAssetsInCents)}</span>
							<span class="text-red-700 font-bold">L {formatCurrencyShorthand(snapshot.totalLiabilitiesInCents)}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<PaginationClient
	page={pagination.page}
	totalPages={data.totalPages}
	onPageChange={pagination.updatePage}
	scrollTarget={tableRef}
/>