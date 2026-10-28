<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Assets-vs-liabilities stacked area (Phase 5 line 1, Variant B).
	 * Assets band rises above zero (soft gray fill); liabilities band
	 * sinks below zero (diagonal hatch — same idiom as overspend bars);
	 * the net worth boundary between them is the solid ink line. Zero
	 * reference dashed when the range straddles it. Print-safe viewBox.
	 */
	let {
		points,
		formatPence,
	}: {
		/** Oldest → newest snapshots */
		points: Array<{
			date: string;
			totalAssetsInCents: number;
			totalLiabilitiesInCents: number;
		}>;
		formatPence: (pence: number) => string;
	} = $props();

	const W = 600;
	const H = 240;
	const PAD = { l: 8, r: 8, t: 14, b: 20 };

	const assets = $derived(points.map((p) => p.totalAssetsInCents));
	const liabilities = $derived(points.map((p) => p.totalLiabilitiesInCents));
	const maxAssets = $derived(points.length ? Math.max(...assets, 0) : 0);
	const minLiab = $derived(points.length ? Math.min(...liabilities, 0) : 0);
	const yHi = $derived(maxAssets * 1.05 || 1);
	const yLo = $derived(minLiab * 1.05 || -1);

	const x = $derived(
		points.length > 1
			? (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r)
			: () => W / 2,
	);
	const y = $derived(
		(v: number) => H - PAD.b - ((v - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b),
	);
	const y0 = $derived(y(0));

	const band = $derived(
		(values: number[]) =>
			values.length > 0
				? `${values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} L${x(values.length - 1).toFixed(1)},${y0.toFixed(1)} L${x(0).toFixed(1)},${y0.toFixed(1)} Z`
				: "",
	);

	const netWorthPath = $derived(
		points
			.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.totalAssetsInCents + p.totalLiabilitiesInCents).toFixed(1)}`)
			.join(" "),
	);

	const midIndex = $derived(Math.floor((points.length - 1) / 2));
	const lastPt = $derived(points[points.length - 1]);
	const dateLabel = (d: string) => d.slice(0, 7);

	const summary = $derived(
		points.length === 0
			? "No snapshots yet — record balances to build the composition"
			: points.length === 1
				? `One snapshot: assets ${formatPence(points[0].totalAssetsInCents)} · liabilities ${formatPence(points[0].totalLiabilitiesInCents)}`
				: `Assets ${formatPence(lastPt.totalAssetsInCents)} · liabilities ${formatPence(lastPt.totalLiabilitiesInCents)} · net ${formatPence(lastPt.totalAssetsInCents + lastPt.totalLiabilitiesInCents)} as of ${lastPt.date} (${points.length} snapshots)`,
	);
</script>

<ChartPanel title="Assets vs liabilities" {summary}>
	{#if points.length > 0}
		<svg
			viewBox="0 0 {W} {H}"
			class="w-full"
			role="img"
			aria-label="Assets band above zero versus liabilities band below zero, with the net worth boundary between them. {summary}"
		>
			<defs>
				<pattern id="liab-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<rect width="6" height="6" fill="none" />
					<line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-ink)" stroke-width="1" opacity="0.35" />
				</pattern>
			</defs>

			<!-- zero reference -->
			<line
				class="chart-dashed"
				x1="{PAD.l}"
				y1="{y0.toFixed(1)}"
				x2="{W - PAD.r}"
				y2="{y0.toFixed(1)}"
				stroke="var(--chart-grid)"
				stroke-width="1"
			/>

			<!-- liabilities band (below zero, hatched) -->
			<path d={band(liabilities)} fill="url(#liab-hatch)" stroke="var(--chart-ink-soft)" stroke-width="0.5" />
			<!-- assets band (above zero, soft fill) -->
			<path d={band(assets)} fill="var(--chart-fill)" stroke="var(--chart-ink-soft)" stroke-width="0.5" />
			<!-- net worth boundary -->
			<path d={netWorthPath} fill="none" stroke="var(--chart-ink)" stroke-width="1.5" />

			<!-- legend -->
			<g font-size="10" fill="var(--chart-ink-soft)">
				<rect x="{PAD.l + 4}" y="{PAD.t}" width="8" height="8" fill="var(--chart-fill)" stroke="var(--chart-ink-soft)" stroke-width="0.5" />
				<text x="{PAD.l + 15}" y="{PAD.t + 7}">assets</text>
				<rect x="{PAD.l + 58}" y="{PAD.t}" width="8" height="8" fill="url(#liab-hatch)" stroke="var(--chart-ink-soft)" stroke-width="0.5" />
				<text x="{PAD.l + 69}" y="{PAD.t + 7}">liabilities</text>
			</g>

			<!-- axis labels: £ values prefixed (Phase 4 gate lesson) -->
			<text x="{PAD.l}" y="{PAD.t + 24}" font-size="10" fill="var(--chart-ink-soft)">max {formatPence(yHi)}</text>
			<text x="{PAD.l}" y="{H - PAD.b - 2}" font-size="10" fill="var(--chart-ink-soft)">min {formatPence(yLo)}</text>
			<text x="{x(0)}" y="{H - 6}" font-size="10" text-anchor="start" fill="var(--chart-ink-soft)">{dateLabel(points[0].date)}</text>
			{#if points.length > 2}
				<text x="{x(midIndex)}" y="{H - 6}" font-size="10" text-anchor="middle" fill="var(--chart-ink-soft)">{dateLabel(points[midIndex].date)}</text>
			{/if}
			<text x="{x(points.length - 1)}" y="{H - 6}" font-size="10" text-anchor="end" fill="var(--chart-ink-soft)">{dateLabel(points[points.length - 1].date)}</text>
		</svg>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no snapshot data]</div>
	{/if}
</ChartPanel>
