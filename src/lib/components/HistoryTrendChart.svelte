<script lang="ts">
	/**
	 * Line chart for month-keyed history (income/expenses), built on LayerChart.
	 * Hover: crosshair lines + highlighted point + tooltip (handled by LayerChart).
	 * Semantics: unknown months break the line (never zero-filled); future
	 * months render as a dashed gray segment.
	 *
	 * Client-only: LayerChart measures the container, and its SSR module graph
	 * hits an init-order cycle ("Cannot access 'TransformContext' before
	 * initialization"), so we render it after mount.
	 */
	import { browser } from '$app/environment';
	import { LineChart } from 'layerchart';
	import { currentMonth } from '$lib/utils/month-grid';

	let {
		points,
		yearStartMonth = 1,
		formatAmount,
		height = 190
	}: {
		points: Array<{ month: string; amountInCents: number | null }>;
		/** 1 = calendar years, 4 = UK tax years */
		yearStartMonth?: number;
		formatAmount: (cents: number) => string;
		height?: number;
	} = $props();

	const known = $derived(points.some((p) => p.amountInCents !== null));

	// Two value fields so known/current and future render as separate series
	// (gap = null breaks the line; future months get their own dashed style).
	type Row = {
		month: string;
		date: Date;
		known: number | null;
		future: number | null;
	};
	const rows = $derived(
		points.map((p): Row => {
			const [y, m] = p.month.split('-').map(Number);
			const future = p.month > currentMonth();
			return {
				month: p.month,
				date: new Date(y, m - 1, 1),
				known: future ? null : p.amountInCents,
				future: future ? p.amountInCents : null
			};
		})
	);

	const series = [
		{
			key: 'known',
			label: 'known',
			value: 'known',
			color: '#000000',
			props: { defined: (d: Row) => d.known !== null, strokeWidth: 1.5 }
		},
		{
			key: 'future',
			label: 'future',
			value: 'future',
			color: '#9ca3af',
			props: {
				defined: (d: Row) => d.future !== null,
				'stroke-dasharray': '4 3'
			}
		}
	];

	// Tick at each year boundary (Jan or Apr)
	const yearTicks = $derived(
		rows.filter((r) => r.month.endsWith(`-${String(yearStartMonth).padStart(2, '0')}`)).map((r) => r.date)
	);
	function yearLabel(d: Date): string {
		const y = d.getFullYear();
		return yearStartMonth === 1 ? String(y) : `${y}/${String(y + 1).slice(-2)}`;
	}

	// Explicit headroom so the top data point doesn't sit on the top edge
	const yMax = $derived(
		Math.max(...rows.map((r) => r.known ?? r.future ?? 0), 1) * 1.08
	);
</script>

{#if !known}
	<p class="text-xs text-gray-500 p-2">NO DATA YET — fill months below to see the trend.</p>
{:else if browser}
	<div class="font-mono text-[10px]">
		<LineChart
			data={rows}
			x="date"
			{series}
			{height}
			padding={{ top: 8, right: 14, bottom: 28, left: 42 }}
			yDomain={[0, yMax]}
			xDomain={rows.length ? [rows[0].date, rows[rows.length - 1].date] : undefined}
			xNice={false}
			props={{
				xAxis: {
					ticks: yearTicks,
					format: yearLabel,
					// extra vertical clearance from the £0 corner label
					tickLabelProps: { dy: '1.3em' }
				},
				yAxis: { format: (v: number) => formatAmount(v) },
				tooltip: {
					header: { format: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` },
					item: { format: (v: number) => formatAmount(v) }
				}
			}}
		/>
	</div>
	<p class="text-[10px] text-gray-600 px-1 pt-1">
		— known &middot; dashed gray = future entries &middot; line break = unknown month
	</p>
{/if}
