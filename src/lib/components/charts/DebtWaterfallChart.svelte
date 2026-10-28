<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * Debt balance waterfall (Phase 5 line 2, Variant B): snowball-ordered
	 * balances as descending steps from total debt toward zero — each step
	 * is one goal's remaining balance (soft fill, ink outline), a dashed
	 * connector runs to zero at the projected debt-free horizon, and each
	 * step carries a projected-payoff tooltip. Print-safe viewBox.
	 */
	let {
		goals,
		totalDebtInCents,
		projectedDebtFreeDate,
		formatPence,
	}: {
		goals: Array<{
			name: string;
			slug: string;
			remainingInCents: number;
			projectedPayoffDate: Date | null;
		}>;
		totalDebtInCents: number;
		projectedDebtFreeDate: Date | null;
		formatPence: (pence: number) => string;
	} = $props();

	const W = 600;
	const H = 200;
	const PAD = { l: 8, r: 8, t: 16, b: 34 };
	const GAP = 4;

	const n = $derived(goals.length);
	const maxV = $derived(Math.max(totalDebtInCents, 1) * 1.05);
	const stepW = $derived(n > 0 ? (W - PAD.l - PAD.r - GAP * (n + 1)) / n : 0);
	const x = $derived((i: number) => PAD.l + GAP + i * (stepW + GAP));
	const y = $derived(
		(v: number) => H - PAD.b - (v / maxV) * (H - PAD.t - PAD.b),
	);

	// cumulative balance BEFORE each goal (steps descend toward zero)
	const cumBefore = $derived(() => {
		let acc = totalDebtInCents;
		const out: number[] = [];
		for (const g of goals) {
			out.push(acc);
			acc = Math.max(0, acc - g.remainingInCents);
		}
		return out;
	});

	const dateShort = (d: Date | null) =>
		d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : "—";

	const summary = $derived(
		n === 0
			? "No tracked debt goals"
			: `${formatPence(totalDebtInCents)} across ${n} goals (snowball order, smallest first) · projected debt-free ${projectedDebtFreeDate ? dateShort(projectedDebtFreeDate) : "unknown (below-minimum payments on some goals)"}`,
	);
</script>

<ChartPanel title="Debt payoff waterfall" {summary}>
	{#if n > 0}
		<svg
			viewBox="0 0 {W} {H}"
			class="w-full"
			role="img"
			aria-label="Debt balances as descending waterfall steps in snowball order with projected payoff dates. {summary}"
		>
			<!-- zero baseline -->
			<line x1="{PAD.l}" y1="{y(0)}" x2="{W - PAD.r}" y2="{y(0)}" stroke="var(--chart-grid)" stroke-width="1" />
			{#each goals as g, i (g.slug)}
				{@const top = cumBefore()[i] - g.remainingInCents}
				<rect
					x="{x(i).toFixed(1)}"
					y="{y(cumBefore()[i]).toFixed(1)}"
					width="{stepW.toFixed(1)}"
					height="{Math.max(y(top) - y(cumBefore()[i]), 1).toFixed(1)}"
					fill="var(--chart-fill)"
					stroke="var(--chart-ink)"
					stroke-width="1"
				>
					<title>{g.name}: {formatPence(g.remainingInCents)} remaining · payoff ~{dateShort(g.projectedPayoffDate)}</title>
				</rect>
				<!-- step label: goal name (truncated) + payoff date -->
				<text
					x="{(x(i) + stepW / 2).toFixed(1)}"
					y="{H - 20}"
					font-size="9"
					text-anchor="middle"
					fill="var(--chart-ink-soft)"
				>{g.name.length > 12 ? g.name.slice(0, 11) + "…" : g.name}</text>
				<text
					x="{(x(i) + stepW / 2).toFixed(1)}"
					y="{H - 8}"
					font-size="9"
					text-anchor="middle"
					fill="var(--chart-ink-soft)"
				>{dateShort(g.projectedPayoffDate)}</text>
			{/each}
			<!-- dashed connector to the debt-free horizon -->
			<line
				class="chart-dashed"
				x1="{(x(n - 1) + stepW + 1).toFixed(1)}"
				y1="{y(0).toFixed(1)}"
				x2="{W - PAD.r}"
				y2="{y(0).toFixed(1)}"
				stroke="var(--chart-ink)"
				stroke-width="1.5"
			>
				<title>debt-free horizon</title>
			</line>
			<!-- total label at the tallest step -->
			<text x="{PAD.l}" y="{PAD.t}" font-size="10" fill="var(--chart-ink-soft)">total {formatPence(totalDebtInCents)}</text>
		</svg>
	{:else}
		<div class="text-xs text-gray-500 p-2 text-center">[no debt goals]</div>
	{/if}
</ChartPanel>
