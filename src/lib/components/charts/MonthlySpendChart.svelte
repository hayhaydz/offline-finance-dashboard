<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Spending by month (Phase 5 line 2, Variant B): one column per month
	 * (soft fill, ink outline), value label above each column, dashed
	 * 6-month average reference, month labels below. Print-safe viewBox.
	 */
	let {
		points,
		formatPence,
	}: {
		/** Oldest → newest months */
		points: Array<{ month: string; totalPence: number }>;
		formatPence: (pence: number) => string;
	} = $props();

	const W = 600;
	const H = 200;
	const PAD = { l: 8, r: 8, t: 18, b: 18 };
	const GAP = 10; // px between columns

	const maxV = $derived(Math.max(...points.map((p) => p.totalPence), 1) * 1.1);
	const colW = $derived(
		points.length > 0 ? (W - PAD.l - PAD.r - GAP * (points.length - 1)) / points.length : 0,
	);
	const x = $derived((i: number) => PAD.l + i * (colW + GAP));
	const colH = $derived((v: number) => (v / maxV) * (H - PAD.t - PAD.b));
	const yTop = $derived((v: number) => H - PAD.b - colH(v));

	const avg = $derived(
		points.length > 0
			? points.reduce((s, p) => s + p.totalPence, 0) / points.length
			: 0,
	);
	const avgY = $derived(H - PAD.b - (avg / maxV) * (H - PAD.t - PAD.b));

	const shortLabel = $derived((pence: number) => {
		const units = pence / 100;
		return units >= 1000 ? `£${(units / 1000).toFixed(1)}k` : `£${Math.round(units)}`;
	});

	const last = $derived(points[points.length - 1]);
	const summary = $derived(
		points.length === 0
			? "No spending recorded yet"
			: `${shortLabel(last.totalPence)} in ${last.month} · 6-month average ${shortLabel(avg)}`,
	);
</script>

<ChartPanel title="Spending by month" {summary}>
	{#if points.length > 0}
		<svg
			viewBox="0 0 {W} {H}"
			class="w-full"
			role="img"
			aria-label="Total spending per month as columns with a dashed average line. {summary}"
		>
			{#each points as p, i (p.month)}
				<rect
					x="{x(i).toFixed(1)}"
					y="{yTop(p.totalPence).toFixed(1)}"
					width="{colW.toFixed(1)}"
					height="{Math.max(colH(p.totalPence), 1).toFixed(1)}"
					fill="var(--chart-fill)"
					stroke="var(--chart-ink)"
					stroke-width="1"
				>
					<title>{p.month}: {formatPence(p.totalPence)}</title>
				</rect>
				<text
					x="{(x(i) + colW / 2).toFixed(1)}"
					y="{(yTop(p.totalPence) - 4).toFixed(1)}"
					font-size="10"
					text-anchor="middle"
					fill="var(--chart-ink-soft)"
				>{shortLabel(p.totalPence)}</text>
				<text
					x="{(x(i) + colW / 2).toFixed(1)}"
					y="{H - 5}"
					font-size="10"
					text-anchor="middle"
					fill="var(--chart-ink-soft)"
				>{p.month.slice(5)}/{p.month.slice(2, 4)}</text>
			{/each}
			<!-- dashed monthly-average reference -->
			<line
				class="chart-dashed"
				x1="{PAD.l}"
				y1="{avgY.toFixed(1)}"
				x2="{W - PAD.r}"
				y2="{avgY.toFixed(1)}"
				stroke="var(--chart-ink-soft)"
				stroke-width="1"
			>
				<title>6-month average {formatPence(avg)}</title>
			</line>
		</svg>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no spending data]</div>
	{/if}
</ChartPanel>
