<script lang="ts">
	import { browser } from "$app/environment";
	import { LineChart } from "layerchart";
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Net worth line chart — A13 layerchart migration (2026-10-31): the
	 * HistoryTrendChart pattern (the reference the user named) applied to
	 * snapshot history. Interactive hover: crosshair + nearest-point
	 * tooltip (date + £). The ChartPanel frame, plain-text summary (a11y),
	 * and export buttons are unchanged; the chart mounts client-only —
	 * layerchart measures its container and its SSR module graph cycles.
	 */
	/** compact axis labels (pence → "-£200,000"); tooltips keep full precision */
	function compactPence(pence: number): string {
		const units = Math.round(Math.abs(pence) / 100).toLocaleString("en-GB");
		return `${pence < 0 ? "-" : ""}£${units}`;
	}

	let {
		points,
		formatPence,
		controls,
		aspect = "default",
	}: {
		/** Oldest → newest, one per snapshot */
		points: Array<{
			date: string;
			netWorthInCents: number;
		}>;
		/** pence → display string (e.g. formatCurrency) */
		formatPence: (pence: number) => string;
		/** optional controls forwarded into the ChartPanel title band */
		controls?: import("svelte").Snippet;
		/** 'wide' = short 180px band for wide bento cells; default 220px */
		aspect?: "default" | "wide";
	} = $props();

	const height = $derived(aspect === "wide" ? 180 : 220);

	type Row = { date: Date; label: string; net: number };
	const rows = $derived(
		points.map((p): Row => {
			const [y, m, d] = p.date.split("-").map(Number);
			return {
				date: new Date(y, (m || 1) - 1, d || 1),
				label: p.date.slice(0, 7),
				net: p.netWorthInCents,
			};
		}),
	);

	const values = $derived(points.map((p) => p.netWorthInCents));
	const minV = $derived(points.length ? Math.min(...values) : 0);
	const maxV = $derived(points.length ? Math.max(...values) : 0);
	// 5% headroom each side (guards flat series) — same semantics as the
	// static chart; the y tick labels are axis bounds, not data points
	const yLo = $derived(minV === maxV ? minV - 1 : minV - (maxV - minV) * 0.05);
	const yHi = $derived(minV === maxV ? maxV + 1 : maxV + (maxV - minV) * 0.05);

	const series = [
		{
			key: "net",
			label: "net worth",
			value: "net",
			color: "#111827",
			props: { strokeWidth: 1.5 },
		},
	];

	// tick at each calendar-year boundary present in the window
	const yearTicks = $derived(
		rows
			.filter((r, i) => i === 0 || r.date.getFullYear() !== rows[i - 1].date.getFullYear())
			.map((r) => r.date),
	);

	const first = $derived(points[0]?.netWorthInCents ?? 0);
	const last = $derived(points[points.length - 1]?.netWorthInCents ?? 0);
	const delta = $derived(points.length > 1 ? last - first : 0);

	const summary = $derived(
		points.length === 0
			? "No snapshots yet — record balances to build the trend"
			: points.length === 1
				? `One snapshot (${points[0].date}): ${formatPence(first)}`
				: `${delta >= 0 ? "+" : "-"}${formatPence(Math.abs(delta))} from ${points[0].date} to ${points[points.length - 1].date} across ${points.length} snapshots (latest ${formatPence(last)})`,
	);
</script>

<ChartPanel title="Net worth over time" {summary} {controls}>
	{#if points.length === 0}
		<div class="text-xs text-gray-500 p-2 text-center">[no snapshot data]</div>
	{:else if points.length === 1}
		<div class="text-xs text-gray-600 p-2 text-center">
			One snapshot ({points[0].date}) — {formatPence(first)}. Record another to draw a line.
		</div>
	{:else if browser}
		<div
			class="font-mono text-[10px]"
			data-interactive-chart="net-worth"
			role="img"
			aria-label="Net worth line over all snapshots, interactive; summary below"
		>
			<LineChart
				data={rows}
				x="date"
				{series}
				{height}
				padding={{ top: 10, right: 16, bottom: 26, left: 52 }}
				yDomain={[yLo, yHi]}
				xDomain={rows.length ? [rows[0].date, rows[rows.length - 1].date] : undefined}
				xNice={false}
				props={{
					xAxis: { ticks: yearTicks, format: (d: Date) => String(d.getFullYear()), tickLabelProps: { dy: "1.3em" } },
					yAxis: { format: (v: number) => compactPence(v) },
					tooltip: {
						header: { format: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` },
						item: { format: (v: number) => formatPence(v) },
					},
				}}
			/>
		</div>
	{:else}
		<!-- V1 CLS fix (2026-11-01): reserve the chart's exact height
		     server-side — see AllocationBar. -->
		<div class="border border-dashed border-gray-200" style="height: {height}px" aria-hidden="true"></div>
	{/if}
	<p class="text-[10px] text-gray-600 px-1 pt-1">
		hover for date + value · faint rules = axis grid, solid line = snapshots
	</p>
</ChartPanel>
