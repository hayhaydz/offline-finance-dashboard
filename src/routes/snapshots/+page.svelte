<script lang="ts">
	import { formatCurrencyShorthand } from '$lib/utils/currency';
	import type { Snapshot } from '$lib/db/schema';

	let { data, form } = $props();

	// Calculate trends for each snapshot (query-time calculation)
	const snapshotsWithTrends = $derived.by(() => {
		return data.snapshots.map((snapshot, index) => {
			// Last snapshot has no previous to compare
			if (index === data.snapshots.length - 1) {
				return { ...snapshot, trends: null };
			}

			const previous = data.snapshots[index + 1];
			const netWorthChange = snapshot.netWorthInCents - previous.netWorthInCents;

			// Handle percentage calculation (avoid division by zero)
			let netWorthPercent = 0;
			if (previous.netWorthInCents !== 0) {
				netWorthPercent = (netWorthChange / Math.abs(previous.netWorthInCents)) * 100;
			}

			return {
				...snapshot,
				trends: {
					netWorthChange,
					netWorthPercent,
					assetsChange: snapshot.totalAssetsInCents - previous.totalAssetsInCents,
					liabilitiesChange: snapshot.totalLiabilitiesInCents - previous.totalLiabilitiesInCents,
					allocatedChange: snapshot.totalAllocatedInCents - previous.totalAllocatedInCents
				}
			};
		});
	});

	function formatTrend(change: number, percent: number): string {
		if (change === 0 && percent === 0) return '0';
		const sign = change >= 0 ? '+' : '';
		return `${sign}${formatCurrencyShorthand(change)} (${sign}${percent.toFixed(1)}%)`;
	}

	function getTrendColor(change: number): string {
		if (change === 0) return '';
		return change > 0 ? 'text-green-700' : 'text-red-700';
	}

	function getTrendArrow(change: number): string {
		if (change === 0) return '';
		return change > 0 ? '↑' : '↓';
	}

	// Truncate notes for table display
	function truncateNotes(notes: string | null, maxLength = 50): string {
		if (!notes) return '-';
		if (notes.length <= maxLength) return notes;
		return notes.substring(0, maxLength) + '...';
	}

	// Confirm delete action
	function confirmDelete(e: Event): boolean {
		if (!confirm('Are you sure you want to delete this snapshot? This action cannot be undone.')) {
			e.preventDefault();
			return false;
		}
		return true;
	}
</script>

<div class="max-w-[1200px] mx-auto p-8">
	<header class="flex justify-between items-center border-b border-gray-300 pb-4 mb-8">
		<div>
			<h1 class="m-0">Snapshots</h1>
			<p class="mt-2 mb-0">Historical net worth tracking</p>
		</div>
		<div class="flex gap-4">
			{#if data.offset > 0}
				<a href="/snapshots?offset={Math.max(0, data.offset - data.limit)}&limit={data.limit}" class="bracket-link">
					[Previous]
				</a>
			{/if}
			{#if data.hasMore}
				<a href="/snapshots?offset={data.offset + data.limit}&limit={data.limit}" class="bracket-link">
					[Next]
				</a>
			{/if}
			<a href="/snapshots/create" class="bracket-link">[Create Snapshot]</a>
		</div>
	</header>

	<main>
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>SNAPSHOTS HISTORY</span>
				<span>{data.snapshots.length} snapshots</span>
			</div>

			{#if data.snapshots.length === 0}
				<div class="bg-gray-50 p-4 border-b border-black">
					<p class="text-gray-600 text-xs mb-0">No snapshots yet. Create your first snapshot to start tracking your net worth over time.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse">
						<thead>
							<tr class="bg-gray-50 border-b border-black">
								<th class="text-left pl-2 py-1 font-normal text-sm">Date</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">Net Worth</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">Assets</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">Liabilities</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">Allocated</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">MoM Change</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">MoM %</th>
								<th class="text-left pl-2 py-1 font-normal text-sm">Notes</th>
								<th class="text-right pr-2 py-1 font-normal text-sm">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each snapshotsWithTrends as snapshot}
								<tr class="border-b border-gray-200 hover:bg-gray-50">
									<td class="pl-2 py-2 text-sm">{snapshot.snapshotDate}</td>
									<td class="text-right pr-2 py-2 text-sm font-bold">{formatCurrencyShorthand(snapshot.netWorthInCents)}</td>
									<td class="text-right pr-2 py-2 text-sm">{formatCurrencyShorthand(snapshot.totalAssetsInCents)}</td>
									<td class="text-right pr-2 py-2 text-sm">{formatCurrencyShorthand(snapshot.totalLiabilitiesInCents)}</td>
									<td class="text-right pr-2 py-2 text-sm">{formatCurrencyShorthand(snapshot.totalAllocatedInCents)}</td>

									{#if snapshot.trends}
										<td class="text-right pr-2 py-2 text-sm {getTrendColor(snapshot.trends.netWorthChange)}">
											{getTrendArrow(snapshot.trends.netWorthChange)} {formatCurrencyShorthand(snapshot.trends.netWorthChange)}
										</td>
										<td class="text-right pr-2 py-2 text-sm {getTrendColor(snapshot.trends.netWorthChange)}">
											{getTrendArrow(snapshot.trends.netWorthChange)} {snapshot.trends.netWorthPercent.toFixed(1)}%
										</td>
									{:else}
										<td class="text-right pr-2 py-2 text-sm text-gray-600">N/A</td>
										<td class="text-right pr-2 py-2 text-sm text-gray-600">N/A</td>
									{/if}

									<td class="pl-2 py-2 text-sm text-gray-600" title={snapshot.notes}>
										{truncateNotes(snapshot.notes)}
									</td>
									<td class="text-right pr-2 py-2 text-sm">
										<a href="/snapshots/{snapshot.slug}" class="bracket-link text-xs mr-2">[View]</a>
										<form method="POST" action="/snapshots/{snapshot.slug}/delete" class="inline" onsubmit={(e) => confirmDelete(e)}>
											<button type="submit" class="bracket-link text-xs">[Delete]</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</main>
</div>
