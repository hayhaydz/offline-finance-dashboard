<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Net worth line chart (Phase 4 V1 #1, Variant B): the Reports-landing
	 * counterpart to the Home hero sparkline. Solid ink line with a soft
	 * area fill, square markers (green/red per step direction, ink for the
	 * latest), first/mid/last date labels on x, min/max on y, and a
	 * zero-line when the range straddles zero. Print-safe viewBox SVG.
	 */
	let {
		points,
		formatPence,
	}: {
		/** Oldest → newest, one per snapshot */
		points: Array<{
			date: string;
			netWorthInCents: number;
		}>;
		/** pence → display string (e.g. formatCurrency) */
		formatPence: (pence: number) => string;
	} = $props();

	const W = 600;
	const H = 220;
	const PAD = { l: 8, r: 8, t: 14, b: 20 };
	const MARKER = 4;

	const values = $derived(points.map((p) => p.netWorthInCents));
	const minV = $derived(points.length ? Math.min(...values) : 0);
	const maxV = $derived(points.length ? Math.max(...values) : 0);
	// pad the y range 5% each side; guard flat series
	const yLo = $derived(minV === maxV ? minV - 1 : minV - (maxV - minV) * 0.05);
	const yHi = $derived(minV === maxV ? maxV + 1 : maxV + (maxV - minV) * 0.05);

	const x = $derived(
		points.length > 1
			? (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r)
			: () => W / 2,
	);
	const y = $derived(
		(v: number) => H - PAD.b - ((v - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b),
	);

	const pathD = $derived(
		points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.netWorthInCents).toFixed(1)}`).join(" "),
	);
	const areaD = $derived(
		points.length > 1
			? `${pathD} L${x(points.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`
			: "",
	);

	// step direction per point (first = neutral, latest = ink)
	const direction = $derived(
		points.map((p, i) => {
			if (i === 0 || i === points.length - 1) return "edge" as const;
			return p.netWorthInCents >= points[i - 1].netWorthInCents
				? ("up" as const)
				: ("down" as const);
		}),
	);

	const straddlesZero = $derived(yLo < 0 && yHi > 0);
	const midIndex = $derived(Math.floor((points.length - 1) / 2));
	// last-point value tag position (flips below the point near the top edge)
	const lastX = $derived(points.length ? x(points.length - 1) : 0);
	const lastY = $derived(points.length ? y(points[points.length - 1].netWorthInCents) : 0);

	const first = $derived(points[0]?.netWorthInCents ?? 0);
	const last = $derived(points[points.length - 1]?.netWorthInCents ?? 0);
	const delta = $derived(points.length > 1 ? last - first : 0);
	const dateLabel = (d: string) => d.slice(0, 7); // YYYY-MM for axis brevity

	const summary = $derived(
		points.length === 0
			? "No snapshots yet — record balances to build the trend"
			: points.length === 1
				? `One snapshot (${points[0].date}): ${formatPence(first)}`
				: `${delta >= 0 ? "+" : "-"}${formatPence(Math.abs(delta))} from ${points[0].date} to ${points[points.length - 1].date} across ${points.length} snapshots (latest ${formatPence(last)})`,
	);
</script>

<ChartPanel title="Net worth over time" {summary}>
	{#if points.length > 0}
		<svg
			viewBox="0 0 {W} {H}"
			class="w-full"
			role="img"
			aria-label="Net worth line over all snapshots, {summary}"
		>
			<!-- zero reference when the range straddles zero -->
			{#if straddlesZero}
				<line
					class="chart-dashed"
					x1="{PAD.l}"
					y1="{y(0).toFixed(1)}"
					x2="{W - PAD.r}"
					y2="{y(0).toFixed(1)}"
					stroke="var(--chart-grid)"
					stroke-width="1"
				/>
			{/if}
			<!-- soft area fill under the line -->
			{#if areaD}
				<path d={areaD} fill="var(--chart-fill)" />
			{/if}
			<!-- the series -->
			<path d={pathD} fill="none" stroke="var(--chart-ink)" stroke-width="1.5" />
			<!-- square markers: green/red per step direction, ink for latest -->
			{#each points as p, i}
				<rect
					x="{x(i) - MARKER / 2}"
					y="{y(p.netWorthInCents) - MARKER / 2}"
					width="{MARKER}"
					height="{MARKER}"
					fill={i === points.length - 1
						? "var(--chart-ink)"
						: direction[i] === "down"
							? "var(--chart-neg)"
							: "var(--chart-pos)"}
				>
					<title>{p.date}: {formatPence(p.netWorthInCents)}</title>
				</rect>
			{/each}
			<!-- y axis: min / max (prefixed — unlabelled £ values get misread as data points) -->
			<text x="{PAD.l}" y="{PAD.t}" font-size="10" fill="var(--chart-ink-soft)">max {formatPence(yHi)}</text>
			<text x="{PAD.l}" y="{H - PAD.b - 2}" font-size="10" fill="var(--chart-ink-soft)">min {formatPence(yLo)}</text>
			<!-- x axis: first / mid / last dates -->
			<text x="{x(0)}" y="{H - 6}" font-size="10" text-anchor="start" fill="var(--chart-ink-soft)">{dateLabel(points[0].date)}</text>
			{#if points.length > 2}
				<text x="{x(midIndex)}" y="{H - 6}" font-size="10" text-anchor="middle" fill="var(--chart-ink-soft)">{dateLabel(points[midIndex].date)}</text>
			{/if}
			<text x="{x(points.length - 1)}" y="{H - 6}" font-size="10" text-anchor="end" fill="var(--chart-ink-soft)">{dateLabel(points[points.length - 1].date)}</text>
			<!-- last-point value tag: bold ink label at the latest marker
			     (positioned above, or below when the point sits near the top) -->
			<text
				x="{Math.max(lastX - 5, PAD.l + 2)}"
				y="{lastY > PAD.t + 18 ? lastY - 7 : lastY + 16}"
				font-size="10"
				text-anchor="end"
				font-weight="bold"
				fill="var(--chart-ink)"
			>{formatPence(last)}</text>
		</svg>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no snapshot data]</div>
	{/if}
</ChartPanel>
