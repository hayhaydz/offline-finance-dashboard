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

<div class="p-0">
	{#if data.snapshots.length === 0}
		<p class="text-gray-600 text-xs p-2">
			No snapshots yet. Create your first snapshot to start tracking your net worth over time.
		</p>
	{:else}
		<table>
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
								<span class={getTrendColor(snapshot.trends.netWorthChange)}>
									{getTrendArrow(snapshot.trends.netWorthChange)}
								</span>
							{:else}
								<span class="text-gray-600">→</span>
							{/if}
						</td>
						<td class="pl-2 text-sm py-2">
							<a href="/snapshots/{snapshot.slug}" class="bracket-link text-xs">{snapshot.snapshotDate}</a>
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
