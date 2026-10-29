<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import { projectMilestones } from "$lib/utils/tool-math";

	// NEW tool (R13 "more more more"): milestone projector — fit the mean
	// monthly net-worth delta over the history window and project the next
	// £10k…£1M crossings. Flat or falling slopes honestly say "never".

	let {
		history,
	}: {
		history: { date: string; netWorthInCents: number }[];
	} = $props();

	const milestones = $derived(projectMilestones({ history }));
	const latest = $derived(history[history.length - 1]);
	const window = $derived(
		history.length >= 2 ? `${history[0].date} → ${latest?.date}` : "",
	);
	const monthlyDelta = $derived(() => {
		if (history.length < 2) return null;
		const first = history[0];
		const firstMs = new Date(`${first.date}T00:00:00.000Z`).getTime();
		const latestMs = new Date(`${latest?.date}T00:00:00.000Z`).getTime();
		const months = Math.max(1, Math.round((latestMs - firstMs) / (30.44 * 86_400_000)));
		return (latest!.netWorthInCents - first.netWorthInCents) / months;
	});
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	{#if history.length < 2}
		<p class="text-gray-500 text-center py-2">
			[at least two snapshots needed to project a slope]
		</p>
	{:else}
		<p class="text-gray-600">
			Window {window} ({history.length} snapshots) · mean monthly delta
			<span class="font-bold {monthlyDelta()! > 0 ? 'text-green-700' : 'text-red-700'}">
				{monthlyDelta()! > 0 ? "+" : ""}{formatCurrency(monthlyDelta()!)}
			</span>
			{#if monthlyDelta()! <= 0}
				— net worth is flat or falling; no milestone has a date.
			{/if}
		</p>

		{#if milestones.length > 0}
			<div class="border border-black overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="bg-gray-100 border-b border-black">
							<th class="text-left px-1 py-0.5">Milestone</th>
							<th class="text-right px-1 py-0.5">Gap from today</th>
							<th class="text-right px-1 py-0.5">Projected crossing</th>
						</tr>
					</thead>
					<tbody>
						{#each milestones as m (m.targetPence)}
							<tr class="border-b border-gray-200 last:border-b-0">
								<td class="px-1 py-0.5 font-bold">{formatCurrency(m.targetPence)}</td>
								<td class="px-1 py-0.5 text-right tabular-nums">
									{m.monthsFromNow} month{m.monthsFromNow !== 1 ? "s" : ""}
								</td>
								<td class="px-1 py-0.5 text-right tabular-nums font-bold text-green-700">
									{m.date}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-gray-600">
				Projections are straight-line from the mean delta — compounding and
				life are not consulted. Treat dates as momentum readings, not promises.
			</p>
		{:else}
			<p class="text-gray-500 text-center py-2">
				[slope is flat or negative — no upcoming milestones]
			</p>
		{/if}
	{/if}
</div>
