<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { monthGrid, type Obligation } from "$lib/utils/surface-views";

	/**
	 * Cashflow calendar (Phase 7 line 2): month grid of projected
	 * obligations detected from recurring transaction patterns (28–35d
	 * band → ~30d cadence). Monday-first, terminal style: days with
	 * dues get an ink badge; today gets a black outline.
	 */
	let {
		year,
		month,
		obligations,
		today = new Date(),
	}: {
		year: number;
		month: number;
		obligations: Obligation[];
		today?: Date;
	} = $props();

	const weeks = $derived(monthGrid(year, month, obligations));
	const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

	// svelte-ignore state_referenced_locally
	const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

	const todayDay = $derived(
		today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month
			? today.getUTCDate()
			: null,
	);

	const totalDue = $derived(
		obligations.reduce((s, o) => s + o.amountPence, 0),
	);

	const summary = $derived(
		obligations.length === 0
			? `No recurring obligations detected for ${monthName}`
			: `${obligations.length} projected dues in ${monthName} · ${formatCurrency(Math.abs(totalDue))} total (from recurring patterns)`,
	);
</script>

<ChartPanel title="Cashflow calendar — {monthName}" {summary}>
	<div class="p-2">
		<table class="w-full text-xs border-collapse">
			<thead>
				<tr>
					{#each DOW as dw (dw)}
						<th class="text-center font-normal text-gray-500 pb-1">{dw}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each weeks as week, wi (wi)}
					<tr>
						{#each week as cell, ci (ci)}
							<td class="p-0.5 align-top">
								{#if cell}
									<div
										class="min-h-12 border {cell.day === todayDay
											? 'border-black border-2'
											: 'border-gray-200'} {cell.items.length > 0 ? 'bg-gray-50' : ''}"
									>
										<div class="text-[10px] text-gray-500 px-1 {cell.items.length > 0
												? 'bg-black text-white'
												: ''} inline-block min-w-5 text-center"
											>{cell.day}</div
										>
										{#each cell.items as item (item.description)}
											<div
												class="px-1 text-[10px] leading-tight truncate"
												title="{item.description} {formatCurrency(Math.abs(item.amountPence))}"
											>
												{formatCurrency(Math.abs(item.amountPence)).replace(".00", "")}
												{item.description.slice(0, 10)}
											</div>
										{/each}
									</div>
								{:else}
									<div class="min-h-12"></div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</ChartPanel>
