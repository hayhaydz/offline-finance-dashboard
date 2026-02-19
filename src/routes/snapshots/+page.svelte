<script lang="ts">
	import { formatCurrencyShorthand } from '$lib/utils/currency';

	let { data } = $props();

	// Calculate trends for each snapshot (query-time calculation)
	const snapshotsWithTrends = $derived.by(() => {
		return data.snapshots.map((snapshot, index) => {
			// Last snapshot has no previous to compare
			if (index === data.snapshots.length - 1) {
				return { ...snapshot, trends: null };
			}

			const previous = data.snapshots[index + 1];
			const netWorthChange = snapshot.netWorthInCents - previous.netWorthInCents;

			return {
				...snapshot,
				trends: {
					netWorthChange
				}
			};
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
	<span><span class={data.staleness.cssClass}>●</span> SNAPSHOTS ({data.snapshots.length})</span>
	<span class="text-xs text-gray-600">{data.staleness.label}</span>
</div>

<!-- Action Button -->
<div class="bg-gray-100 border-b border-black p-2 flex justify-end">
	<a href="/snapshots/create" class="bracket-link text-xs">[+ Create Snapshot]</a>
</div>

<div class="p-2">
	{#if data.snapshots.length === 0}
		<p class="text-gray-600 text-xs mb-2">
			No snapshots yet. Create your first snapshot to start tracking your net worth over time.
		</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="text-left pl-1">Date</th>
					<th class="text-right pr-1">Net Worth</th>
					<th class="text-right pr-1">Accounts</th>
					<th class="text-right pr-1">Goals</th>
					<th class="text-right pr-1">Trend</th>
					<th class="text-right pr-1">MoM Change</th>
				</tr>
			</thead>
			<tbody>
				{#each snapshotsWithTrends as snapshot}
					<tr>
						<td class="pl-1 text-sm">
							<a href="/snapshots/{snapshot.slug}" class="bracket-link text-xs">{snapshot.snapshotDate}</a>
						</td>
						<td class="text-right pr-1 text-sm">{formatCurrencyShorthand(snapshot.netWorthInCents)}</td>
						<td class="text-right pr-1 text-sm">{snapshot.accountsBreakdown?.accounts?.length ?? 0}</td>
						<td class="text-right pr-1 text-sm">{snapshot.goalsBreakdown?.goals?.length ?? 0}</td>
						{#if snapshot.trends}
							<td class="text-right pr-1 text-sm {getTrendColor(snapshot.trends.netWorthChange)}">
								{getTrendArrow(snapshot.trends.netWorthChange)}
							</td>
							<td class="text-right pr-1 text-sm">
								{snapshot.trends.netWorthChange >= 0 ? '+' : ''}{formatCurrencyShorthand(snapshot.trends.netWorthChange)}
							</td>
						{:else}
							<td class="text-right pr-1 text-sm text-gray-600">→</td>
							<td class="text-right pr-1 text-sm text-gray-600">N/A</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<!-- Pagination -->
{#if data.offset > 0 || data.hasMore}
	<div class="p-2 flex justify-center gap-4">
		{#if data.offset > 0}
			<a href="/snapshots?offset={Math.max(0, data.offset - data.limit)}&limit={data.limit}" class="bracket-link text-xs">[Previous]</a>
		{/if}
		{#if data.hasMore}
			<a href="/snapshots?offset={data.offset + data.limit}&limit={data.limit}" class="bracket-link text-xs">[Next]</a>
		{/if}
	</div>
{/if}
