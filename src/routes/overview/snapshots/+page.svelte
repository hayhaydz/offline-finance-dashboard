<script lang="ts">
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import { listnav } from '$lib/utils/list-nav';
	import { formatCurrency, formatCurrencyShorthand } from '$lib/utils/currency';
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
<h1 class="sr-only">Snapshots</h1>
{#if data.snapshots.length > 0}
	{@const latest = snapshotsWithTrends[0]}
	<!-- v3.1 border doctrine: boxed panel inside the page frame (was a
	     full-bleed border-b band) -->
	<div class="p-2">
	<div class="border border-black grid grid-cols-2 md:grid-cols-4 divide-x divide-black">
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
			<!-- v3.1: "page 0 of 1" (zero-indexed, and pagination is not a
			     freshness fact) → snapshot count; the pager sits under the grid -->
			<div class="text-[10px] text-gray-500">{data.totalSnapshots} snapshot{data.totalSnapshots !== 1 ? 's' : ''} recorded</div>
		</div>
		<div class="px-2 py-1.5">
			<div class="text-[10px] uppercase font-bold text-gray-600">Action</div>
			<a href="/overview/snapshots/create" class="bracket-link text-xs">+ Create Snapshot</a>
			<div class="text-[10px] text-gray-500">locks today's balances</div>
		</div>
	</div>
	</div>
{/if}

<!-- v3.1 third-mandate: the summary strip already carries freshness +
     the create action — this duplicate header band is removed (two red
     dots, two [+ Create Snapshot], stacked rules) -->
<div class="p-2">
	{#if data.snapshots.length === 0}
		<p class="text-gray-600 text-xs">
			No snapshots yet. Create your first snapshot to start tracking your net worth over time.
		</p>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2" use:listnav>
			{#each snapshotsWithTrends as snapshot, i (snapshot.slug)}
				{@const assetsAbs = Math.abs(snapshot.totalAssetsInCents)}
				{@const liabAbs = Math.abs(snapshot.totalLiabilitiesInCents)}
				{@const total = assetsAbs + liabAbs}
				<!-- v3.1 harvest: trailing 6-month sparkline — the card grid's
				     figures are near-identical month to month (vision: "add a
				     signal that actually varies"); the shape is the signal -->
				{@const window = snapshotsWithTrends.slice(i, i + 6).map((s) => s.netWorthInCents).reverse()}
				{@const wMin = Math.min(...window)}
				{@const wMax = Math.max(...window)}
				{@const sparkPts = window.length > 1 && wMax > wMin
					? window.map((v, k) => `${(4 + (k / (window.length - 1)) * 92).toFixed(1)},${(16 - ((v - wMin) / (wMax - wMin)) * 14).toFixed(1)}`).join(' ')
					: null}
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
					<!-- v3.1: full precision — shorthand drops .00 only on whole
					     pounds, so 4 of 18 cards read "£253,790" beside "£253,790.16"
					     (same class as the sweep-9 summary-row find) -->
					{formatCurrency(snapshot.netWorthInCents)}
				</div>
				{#if sparkPts}
					<svg viewBox="0 0 100 18" class="w-full h-3.5 mt-0.5" role="img" aria-label="Trailing 6-month net worth trend ending at this snapshot">
						<polyline points={sparkPts} fill="none" stroke="#111827" stroke-width="1.5" />
					</svg>
				{/if}
			</div>
				<!-- assets vs liabilities composition bar -->
				<div class="px-2 pb-2 mt-auto">
					<div class="flex h-2 border border-black" title="Assets {formatCurrency(snapshot.totalAssetsInCents)} vs liabilities {formatCurrency(snapshot.totalLiabilitiesInCents)}">
						{#if total > 0}
							<div class="h-full bg-green-700" style="width: {(assetsAbs / total) * 100}%"></div>
							<div class="h-full bg-red-700 flex-1"></div>
						{/if}
					</div>
					<div class="flex justify-between text-[10px] mt-1 tabular-nums">
						<span class="text-green-700 font-bold">A {formatCurrency(snapshot.totalAssetsInCents)}</span>
						<span class="text-red-700 font-bold">L {formatCurrency(snapshot.totalLiabilitiesInCents)}</span>
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