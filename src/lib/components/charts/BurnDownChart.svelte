<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Budget burn-down (Phase 4 V1 #2, Variant B): cumulative spend curve
	 * (solid ink, square marker at today) vs linear pace line (dashed) to
	 * the monthly target. Print-safe: viewBox-scaled SVG, CSS-variable
	 * colours, no fixed pixel sizes, no interactivity required.
	 */
	let {
		points,
		totalDays,
		targetPence,
		todayDay,
		spendLabel,
	}: {
		points: { day: number; cumulativePence: number }[];
		totalDays: number;
		targetPence: number;
		todayDay: number;
		spendLabel: (pence: number) => string;
	} = $props();

	const W = 600;
	const H = 200;
	const PAD = { l: 10, r: 10, t: 12, b: 20 };

	const maxCumulative = $derived(
		Math.max(targetPence, ...points.map((p) => p.cumulativePence), 1),
	);
	const yMax = $derived(Math.ceil(maxCumulative * 1.05));

	const x = (day: number) =>
		PAD.l + ((day - 1) / Math.max(totalDays - 1, 1)) * (W - PAD.l - PAD.r);
	const y = (pence: number) =>
		H - PAD.b - (pence / yMax) * (H - PAD.t - PAD.b);

	const spentPath = $derived(
		points.map((p) => `${x(p.day).toFixed(1)},${y(p.cumulativePence).toFixed(1)}`).join(" "),
	);
	const lastPoint = $derived(points[Math.min(todayDay, points.length) - 1] ?? points[points.length - 1]);

	const summary = $derived(
		`${spendLabel(lastPoint?.cumulativePence ?? 0)} spent of ${spendLabel(targetPence)} target · day ${Math.min(todayDay, totalDays)} of ${totalDays} · pace line = even spend to target`,
	);
</script>

<ChartPanel title="Spend burn-down" {summary}>
	<svg
		viewBox="0 0 {W} {H}"
		class="w-full"
		role="img"
		aria-label="Cumulative spend versus even pace to the monthly target, with a marker on today"
	>
		<!-- even-pace line: day 1 → end of month at target (dashed projection) -->
		<line
			class="chart-dashed"
			x1="{x(1)}"
			y1="{y(0)}"
			x2="{x(totalDays)}"
			y2="{y(targetPence)}"
			stroke="var(--chart-grid)"
			stroke-width="1.5"
		/>
		<!-- target reference at the right edge -->
		<line
			x1="{x(totalDays) - 4}"
			y1="{y(targetPence)}"
			x2="{x(totalDays)}"
			y2="{y(targetPence)}"
			stroke="var(--chart-ink-soft)"
			stroke-width="2"
		/>
		<!-- actual cumulative spend -->
		<polyline
			points={spentPath}
			fill="none"
			stroke="var(--chart-ink)"
			stroke-width="1.5"
		/>
		<!-- today marker: vertical dashed + square on the curve -->
		<line
			class="chart-dashed"
			x1="{x(Math.min(todayDay, totalDays))}"
			y1="{PAD.t}"
			x2="{x(Math.min(todayDay, totalDays))}"
			y2="{H - PAD.b}"
			stroke="var(--chart-ink-soft)"
			stroke-width="1"
		/>
		{#if lastPoint}
			<rect
				x="{x(Math.min(todayDay, points.length)) - 3}"
				y="{y(lastPoint.cumulativePence) - 3}"
				width="6"
				height="6"
				fill="var(--chart-ink)"
			/>
		{/if}
		<!-- axis labels: £ values sit ABOVE the baseline, dates BELOW it —
		     sharing the bottom row made £0/d1 and £max/d31 collide (P1, gate) -->
		<text x="{PAD.l}" y="{H - PAD.b - 4}" font-size="10" fill="var(--chart-ink-soft)">£0</text>
		<text x="{W - PAD.r}" y="{H - PAD.b - 4}" font-size="10" text-anchor="end" fill="var(--chart-ink-soft)">
			{spendLabel(yMax)}
		</text>
		<text x="{x(1) + 2}" y="{H - 6}" font-size="10" text-anchor="start" fill="var(--chart-ink-soft)">d1</text>
		<text x="{x(totalDays) - 2}" y="{H - 6}" font-size="10" text-anchor="end" fill="var(--chart-ink-soft)">d{totalDays}</text>
	</svg>
</ChartPanel>
