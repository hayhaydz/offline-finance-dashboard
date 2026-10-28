<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { formatCurrency } from "$lib/utils/currency";
	import { heatLevel, type RatePoint } from "$lib/utils/surface-views";

	/**
	 * Rate heatmap (Phase 7 line 2, Variant B): accounts × months grid.
	 * Magnitude is INK DENSITY (5 gray→black levels), not semantic
	 * colour — rates aren't good/bad. Cells carry rate tooltips; the
	 * legend explains the scale. Pure CSS, print-safe.
	 */
	let {
		rows,
		months,
	}: {
		/** one row per account; rates = effective series */
		rows: Array<{ name: string; rates: RatePoint[] }>;
		/** month-start dates (columns), oldest first */
		months: Date[];
	} = $props();

	const LEVEL_BG = ["#f9fafb", "#e5e7eb", "#9ca3af", "#4b5563", "#111827"];

	const cells = $derived(
		rows.map((row) => ({
			name: row.name,
			values: months.map((m) => rateFor(row.rates, m)),
		})),
	);

	const allRates = $derived(
		cells.flatMap((r) => r.values.map((v) => v.rate).filter((r): r is number => r !== null)),
	);
	const minRate = $derived(allRates.length ? Math.min(...allRates) : 0);
	const maxRate = $derived(allRates.length ? Math.max(...allRates) : 0);

	const monthLabel = (m: Date) =>
		m.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

	function rateFor(rates: RatePoint[], m: Date) {
		let best: { rate: number; effectiveFrom: Date } | null = null;
		for (const r of rates) {
			if (r.effectiveFrom.getTime() <= m.getTime()) {
				if (!best || r.effectiveFrom.getTime() > best.effectiveFrom.getTime()) best = r;
			}
		}
		return { rate: best?.rate ?? null, title: best?.rate };
	}

	const withAnyData = $derived(cells.some((r) => r.values.some((v) => v.rate !== null)));
	const summary = $derived(
		!withAnyData
			? "No rate history recorded yet — add interest rates to see the heatmap"
			: `${rows.length} accounts × ${months.length} months · rates ${(minRate / 100).toFixed(2)}%–${(maxRate / 100).toFixed(2)}% (ink density = rate level, not semantic)`,
	);
</script>

<ChartPanel title="Rate heatmap" {summary}>
	{#if withAnyData}
		<div class="p-2 overflow-x-auto">
			<table class="text-xs border-collapse">
				<thead>
					<tr>
						<th class="text-left pr-2 font-bold"></th>
						{#each months as m (m.toISOString())}
							<th class="px-1 font-normal text-gray-500">{monthLabel(m)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each cells as row (row.name)}
						<tr>
							<td class="pr-2 whitespace-nowrap truncate max-w-36" title={row.name}
								>{row.name}</td
							>
							{#each row.values as v, i (i)}
								<td class="p-0">
									{#if v.rate === null}
										<div class="w-9 h-5 border border-gray-100"></div>
									{:else}
										<div
											class="w-9 h-5 flex items-center justify-center text-[10px] {heatLevel(v.rate, minRate, maxRate) >= 3
												? 'text-white'
												: 'text-black'}"
											style="background: {LEVEL_BG[heatLevel(v.rate, minRate, maxRate)]}"
											title="{row.name} · {monthLabel(months[i])} · {(v.rate / 100).toFixed(2)}%"
										>
											{(v.rate / 100).toFixed(1)}
										</div>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="flex items-center gap-1 mt-2 text-[10px] text-gray-500">
				<span>low</span>
				{#each LEVEL_BG as bg, i (i)}
					<div class="w-6 h-3 border border-gray-200" style="background: {bg}"></div>
				{/each}
				<span>high</span>
			</div>
		</div>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no rate history]</div>
	{/if}
</ChartPanel>
