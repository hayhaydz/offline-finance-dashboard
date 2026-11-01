<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";
	import { heatLevel, type RatePoint } from "$lib/utils/surface-views";

	/**
	 * Rate heatmap — v3.1 second-mandate redesign (2026-10-31): the v1
	 * ink-grid had no hover detail and a swatch-only legend ("looks
	 * really bad, doesn't seem interactive" — user). Now: larger cells,
	 * a numeric gradient legend, per-cell hover with a live detail panel
	 * (account · month · rate · change vs previous), row headers carry
	 * the current rate + period trend, and rows highlight on hover.
	 * Rate level stays ink density (rates aren't good/bad); the scale is
	 * now numerical and honest.
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

	let hover: { account: string; monthIdx: number; rate: number; prev: number | null } | null = $state(null);
	let hoverRow: string | null = $state(null);

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
	const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

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

	// row header extras: current rate + change across the window
	const rowMeta = $derived(
		cells.map((row) => {
			const known = row.values.map((v) => v.rate);
			const first = known.find((r): r is number => r !== null) ?? null;
			const last = [...known].reverse().find((r): r is number => r !== null) ?? null;
			return { name: row.name, current: last, changed: first !== null && last !== null && first !== last };
		}),
	);

	const summary = $derived(
		!withAnyData
			? "No rate history recorded yet — add interest rates to see the heatmap"
			: `${rows.length} accounts × ${months.length} months · rates ${pct(minRate)}–${pct(maxRate)}`,
	);

	function onCell(account: string, i: number, rate: number | null) {
		if (rate === null) {
			hover = null;
			return;
		}
		const prev = i > 0 ? (cells.find((c) => c.name === account)?.values[i - 1].rate ?? null) : null;
		hover = { account, monthIdx: i, rate, prev };
	}
</script>

<ChartPanel title="Rate heatmap" {summary}>
	{#if withAnyData}
		<div class="p-2">
			<div class="overflow-x-auto">
				<table class="text-xs border-collapse">
					<thead>
						<tr class="border-b border-black">
							<th class="text-left pr-3 font-bold pb-1" scope="col"><span class="sr-only">Account</span></th>
							{#each months as m, i (m.toISOString())}
								<th class="pb-1 font-normal text-gray-600 text-center w-14" scope="col">
									{#if i === months.length - 1}
										<span class="font-bold text-gray-900">{monthLabel(m)}</span>
									{:else}
										{monthLabel(m)}
									{/if}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each cells as row, ri (row.name)}
							<tr
								class="transition-colors duration-150 {hoverRow === row.name ? 'bg-gray-50' : ''}"
								onmouseenter={() => (hoverRow = row.name)}
								onmouseleave={() => (hoverRow = null)}
							>
								<th class="pr-3 whitespace-nowrap truncate max-w-44 text-left py-0.5" scope="row" title={row.name}>
									<span class="font-normal {rowMeta[ri].current !== null ? 'text-gray-900' : 'text-gray-500'}">{row.name}</span>
									{#if rowMeta[ri].current !== null}
										<span class="ml-1 text-[10px] tabular-nums {rowMeta[ri].changed ? 'text-green-700 font-bold' : 'text-gray-500'}">{pct(rowMeta[ri].current!)}</span>
									{/if}
								</th>
								{#each row.values as v, i (i)}
									<td class="p-0.5">
										{#if v.rate === null}
											<div class="w-13 h-6 border border-dashed border-black"></div>
										{:else}
											<button
												type="button"
												class="w-13 h-6 flex items-center justify-center text-[10px] tabular-nums cursor-pointer border border-black transition-colors duration-150
													{heatLevel(v.rate, minRate, maxRate) >= 3 ? 'text-white' : 'text-black'}
													{hover?.account === row.name && hover?.monthIdx === i ? 'ring-2 ring-black ring-offset-[-1px]' : ''}"
												style="background: {LEVEL_BG[heatLevel(v.rate, minRate, maxRate)]}"
												aria-label="{row.name} {monthLabel(months[i])}: {pct(v.rate)}"
												onmouseenter={() => onCell(row.name, i, v.rate)}
												onfocus={() => onCell(row.name, i, v.rate)}
												onmouseleave={() => (hover = null)}
												onblur={() => (hover = null)}
											>
												{(v.rate / 100).toFixed(2)}
											</button>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- detail panel + numeric legend (skill: hover tooltips + numerical legends) -->
			<div class="flex flex-wrap items-center justify-between gap-2 mt-2 border-t border-gray-200 pt-2">
				<div class="text-xs tabular-nums min-h-5" aria-live="polite">
					{#if hover}
						<span class="font-bold">{hover.account}</span>
						<span class="text-gray-500"> · {months[hover.monthIdx].toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
						<span class="font-bold ml-2">{pct(hover.rate)}</span>
						{#if hover.prev !== null && hover.prev !== hover.rate}
							<span class="ml-1 {hover.rate > hover.prev ? 'text-green-700' : 'text-red-700'} font-bold">
								{hover.rate > hover.prev ? '▲' : '▼'} {pct(Math.abs(hover.rate - hover.prev))}
							</span>
						{:else if hover.prev !== null}
							<span class="text-gray-500 ml-1">· unchanged</span>
						{/if}
					{:else}
						<span class="text-gray-500">hover a cell for account · month · rate · change</span>
					{/if}
				</div>
				<div class="flex items-center gap-1 text-[10px] text-gray-600 tabular-nums">
					<span>{pct(minRate)}</span>
					{#each LEVEL_BG as bg, i (i)}
						<div class="w-7 h-3 border border-black" style="background: {bg}" title="level {i + 1}/5"></div>
					{/each}
					<span>{pct(maxRate)}</span>
				</div>
			</div>
		</div>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no rate history]</div>
	{/if}
</ChartPanel>
