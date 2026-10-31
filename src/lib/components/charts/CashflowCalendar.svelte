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
		controls,
	}: {
		year: number;
		month: number;
		obligations: Obligation[];
		today?: Date;
		/** optional controls forwarded into the ChartPanel title band */
		controls?: import('svelte').Snippet;
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

	// v3.1 A13/§10.2: real hover interactivity (native titles were not enough)
	let hoverDay: number | null = $state(null);
	const hoveredCell = $derived(
		hoverDay === null ? null : (weeks.flat().find((c) => c?.day === hoverDay) ?? null),
	);
	const remainingDue = $derived(
		obligations
			.filter((o) => todayDay === null || Number(o.date.slice(8, 10)) >= todayDay)
			.reduce((s, o) => s + Math.abs(o.amountPence), 0),
	);

	const summary = $derived(
		obligations.length === 0
			? `No recurring obligations detected for ${monthName}`
			: `${obligations.length} projected dues in ${monthName} · ${formatCurrency(Math.abs(totalDue))} total · ${formatCurrency(remainingDue)} still ahead (from recurring patterns)`,
	);
</script>

<ChartPanel title="Cashflow calendar — {monthName}" {summary} {controls}>
	<div class="p-2">
		<!-- v3.1 fix: table-fixed — auto layout let due-day content (truncated
		     labels) widen Tue/Fri columns 3× vs empty days -->
		<table class="w-full table-fixed text-xs border-collapse">
			<thead>
				<tr>
					{#each DOW as dw (dw)}
						<th class="text-left font-normal text-gray-500 pb-1 pl-1">{dw}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each weeks as week, wi (wi)}
					<tr>
						{#each week as cell, ci (ci)}
							<td class="p-0.5 align-top">
								{#if cell}
									{@const isPast = todayDay !== null && cell.day < todayDay}
									<div
										role="img"
										aria-label={cell.items.length > 0
											? `${monthName} ${cell.day}: ${cell.items.map((i) => `${i.description} ${formatCurrency(Math.abs(i.amountPence))}`).join(' · ')}`
											: `${monthName} ${cell.day}, no dues`}
										class="min-h-12 border {cell.day === todayDay
											? 'border-black border-2'
											: 'border-gray-200'} {cell.items.length > 0
											? isPast
												? 'bg-gray-50 opacity-60'
												: 'bg-gray-50'
											: ''} {hoverDay === cell.day && cell.items.length > 0 ? 'outline outline-1 outline-black' : ''} transition-[outline] duration-150"
										onmouseenter={() => (hoverDay = cell.day)}
										onmouseleave={() => (hoverDay = null)}
									>
										<div class="text-[10px] text-gray-500 px-1 {cell.items.length > 0
												? 'bg-black text-white'
												: ''} inline-block min-w-5 text-center"
											>{cell.day}</div
										>
										{#if cell.day === todayDay}
											<!-- v3.1 A13: today says TODAY — the black due-chip alone was
											     ambiguous against the outline marker -->
											<div class="px-1 text-[8px] font-bold tracking-wider">TODAY</div>
										{/if}
										{#each cell.items as item (item.description)}
											<div
												class="px-1 text-[10px] leading-tight truncate {isPast ? 'text-gray-400' : ''}"
												title="{item.description} {formatCurrency(Math.abs(item.amountPence))}"
											>
												{formatCurrency(Math.abs(item.amountPence)).replace(".00", "")}
												{item.description.slice(0, 10)}
											</div>
										{/each}
									</div>
								{:else}
									<!-- v3.1 third-mandate craft: leading/trailing blanks
									     carry the same hairline as day cells — borderless
									     voids made week 1 read as a ragged hole -->
									<div class="min-h-12 border border-gray-200"></div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
		<!-- hover detail (v3.1 §10.2: full descriptions on hover, not native titles) -->
		<div class="text-xs tabular-nums min-h-5 mt-1.5" aria-live="polite">
			{#if hoveredCell && hoveredCell.items.length > 0}
				<span class="font-bold">{monthName.slice(0, 3).toUpperCase()} {hoveredCell.day}</span>
				<span class="mx-1 text-gray-400">·</span>
				{#each hoveredCell.items as item, i (item.description)}
					{#if i > 0}<span class="mx-1 text-gray-400">·</span>{/if}
					<span>{item.description} <span class="font-bold">{formatCurrency(Math.abs(item.amountPence))}</span></span>
				{/each}
				{#if todayDay !== null && hoveredCell.day >= todayDay}
					<span class="ml-2 text-gray-500">still ahead this month: {formatCurrency(remainingDue)}</span>
				{/if}
			{:else}
				<span class="text-gray-500">hover a marked day for full dues{todayDay !== null && remainingDue > 0 ? ` · ${formatCurrency(remainingDue)} still ahead` : ''}</span>
			{/if}
		</div>
	</div>
</ChartPanel>
