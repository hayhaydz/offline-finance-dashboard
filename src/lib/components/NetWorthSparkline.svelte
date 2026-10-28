<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';

	/**
	 * Net worth hero sparkline (proposal #11, 2026-10-27 audit) —
	 * Variant B terminal chart language: crisp monochrome SVG, square
	 * markers, green/red semantics per month-over-month direction,
	 * monospace labels. Pure SVG — no client JS beyond this component.
	 */
	let {
		points,
		width = 260,
		height = 64
	}: {
		/** Oldest → newest, one per snapshot */
		points: Array<{ date: string; netWorthInCents: number }>;
		width?: number;
		height?: number;
	} = $props();

	const PAD = 6;
	const MARKER = 4;

	const values = $derived(points.map((p) => p.netWorthInCents));
	const minV = $derived(Math.min(...values));
	const maxV = $derived(Math.max(...values));

	// x/y scales — guard single-point / flat ranges
	const x = $derived(
		points.length > 1
			? (i: number) => PAD + (i / (points.length - 1)) * (width - 2 * PAD - MARKER) + MARKER / 2
			: () => width / 2,
	);
	const y = $derived(
		maxV > minV
			? (v: number) =>
					PAD + (1 - (v - minV) / (maxV - minV)) * (height - 2 * PAD - MARKER) + MARKER / 2
			: (v: number) => height / 2 + (v === maxV ? -0.5 : 0.5),
	);

	const pathD = $derived(points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.netWorthInCents).toFixed(1)}`).join(' '));

	// MoM direction per point (first point has no predecessor → neutral)
	const direction = $derived(
		points.map((p, i) => {
			if (i === 0) return 'first' as const;
			return p.netWorthInCents >= points[i - 1].netWorthInCents ? ('up' as const) : ('down' as const);
		})
	);

	const first = $derived(points[0]?.netWorthInCents ?? 0);
	const last = $derived(points[points.length - 1]?.netWorthInCents ?? 0);
	const delta = $derived(points.length > 1 ? last - first : 0);
	const deltaLabel = $derived(
		points.length > 1
			? `${delta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(delta))} over ${points.length} snapshots`
			: 'need ≥2 snapshots for a trend'
	);

	// Last-point connector emphasis: dashed where the trend would extend
	const lastDir = $derived(direction[direction.length - 1]);
</script>

{#if points.length > 0}
	<div class="flex items-center gap-2" role="img" aria-label="Net worth trend: {deltaLabel}">
		<svg {width} {height} viewBox="0 0 {width} {height}" class="block shrink-0" font-size="10">
			<!-- polyline -->
			<path d={pathD} fill="none" stroke="#000" stroke-width="1.5" />

			<!-- square markers, coloured by MoM direction (Variant B) -->
			{#each points as p, i}
				<rect
					x={x(i) - MARKER / 2}
					y={y(p.netWorthInCents) - MARKER / 2}
					width={MARKER}
					height={MARKER}
					fill={i === points.length - 1 ? '#000' : direction[i] === 'down' ? '#b91c1c' : '#15803d'}
				>
					<title>{p.date}: {formatCurrency(p.netWorthInCents)}</title>
				</rect>
			{/each}
		</svg>
		<div class="text-[10px] leading-tight">
			<div class="font-bold {lastDir === 'down' ? 'text-red-700' : 'text-green-700'}">
				{delta >= 0 ? '+' : '-'}{formatCurrency(Math.abs(delta))}
			</div>
			<div class="text-gray-500">{points.length} snapshots</div>
		</div>
	</div>
{/if}
