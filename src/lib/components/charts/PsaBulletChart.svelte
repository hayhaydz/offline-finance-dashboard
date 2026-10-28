<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	/**
	 * PSA bullet chart (Phase 5 line 2, Variant B): classic bullet —
	 * light-gray allowance zone, red-hatched over-allowance zone, solid ink
	 * measure (actual taxable interest), soft projected extension to the
	 * forecast, vertical allowance marker. Over-allowance portion of the
	 * measure turns red (semantic). Print-safe viewBox.
	 */
	let {
		taxYearLabel,
		band,
		allowancePence,
		actualPence,
		projectedPence,
		formatPence,
	}: {
		taxYearLabel: string;
		band: string;
		allowancePence: number;
		actualPence: number;
		projectedPence: number;
		formatPence: (pence: number) => string;
	} = $props();

	const W = 600;
	const H = 120;
	const PAD = { l: 8, r: 8, t: 14, b: 22 };
	const BAR_Y = 46;
	const BAR_H = 18;

	const forecast = $derived(actualPence + projectedPence);
	const scaleMax = $derived(
		Math.max(forecast, allowancePence, 1) * 1.12,
	);
	const x = $derived(
		(pence: number) => PAD.l + (pence / scaleMax) * (W - PAD.l - PAD.r),
	);

	const allowanceX = $derived(x(allowancePence));
	const actualW = $derived(x(actualPence) - PAD.l);
	const overAllowance = $derived(actualPence > allowancePence && allowancePence > 0);
	const withinAllowanceW = $derived(
		overAllowance ? x(allowancePence) - PAD.l : actualW,
	);
	const overW = $derived(overAllowance ? x(actualPence) - x(allowancePence) : 0);
	const projectedW = $derived(Math.max(x(forecast) - x(actualPence), 0));

	const zoneEndX = $derived(W - PAD.r);

	const summary = $derived(
		allowancePence === 0
			? `${taxYearLabel} · ${band} band — no tax-free interest allowance (additional rate). Actual ${formatPence(actualPence)} taxable.`
			: `${taxYearLabel} · ${band} band · PSA ${formatPence(allowancePence)} — actual ${formatPence(actualPence)}${projectedPence > 0 ? `, projected +${formatPence(projectedPence)} → forecast ${formatPence(forecast)}` : ""} taxable${overAllowance ? ` — OVER allowance by ${formatPence(actualPence - allowancePence)}` : ""}`,
	);
</script>

<ChartPanel title="Personal savings allowance" {summary}>
	<svg
		viewBox="0 0 {W} {H}"
		class="w-full"
		role="img"
		aria-label="Bullet chart of taxable interest against the personal savings allowance. {summary}"
	>
		<defs>
			<pattern id="psa-over-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<rect width="6" height="6" fill="none" />
				<line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-neg)" stroke-width="1" opacity="0.3" />
			</pattern>
		</defs>

		<!-- allowance zone (light) and over-allowance zone (red hatch) -->
		<rect x="{PAD.l}" y="{BAR_Y - 6}" width="{Math.max(allowanceX - PAD.l, 0)}" height="{BAR_H + 12}" fill="var(--chart-fill)" />
		{#if allowancePence > 0}
			<rect x="{allowanceX}" y="{BAR_Y - 6}" width="{Math.max(zoneEndX - allowanceX, 0)}" height="{BAR_H + 12}" fill="url(#psa-over-hatch)" />
		{/if}

		<!-- measure: actual within allowance (ink) + over allowance (red) -->
		<rect x="{PAD.l}" y="{BAR_Y}" width="{Math.max(withinAllowanceW, 0)}" height="{BAR_H}" fill="var(--chart-ink)" />
		{#if overW > 0}
			<rect x="{allowanceX}" y="{BAR_Y}" width="{overW}" height="{BAR_H}" fill="var(--chart-neg)" />
		{/if}
		<!-- projected extension (soft, from actual to forecast) -->
		{#if projectedW > 0}
			<rect
				x="{x(actualPence)}"
				y="{BAR_Y}"
				width="{projectedW}"
				height="{BAR_H}"
				fill="var(--chart-ink-soft)"
				opacity="0.45"
			>
				<title>Projected additional taxable {formatPence(projectedPence)}</title>
			</rect>
		{/if}

		<!-- allowance marker -->
		{#if allowancePence > 0}
			<line x1="{allowanceX}" y1="{BAR_Y - 10}" x2="{allowanceX}" y2="{BAR_Y + BAR_H + 10}" stroke="var(--chart-ink)" stroke-width="2" />
			<text x="{allowanceX - 3}" y="{BAR_Y - 14}" font-size="10" text-anchor="end" fill="var(--chart-ink-soft)">
				PSA {formatPence(allowancePence)}
			</text>
		{/if}

		<!-- scale labels: 0 / allowance / forecast -->
		<text x="{PAD.l}" y="{H - 7}" font-size="10" fill="var(--chart-ink-soft)">£0</text>
		<text x="{zoneEndX}" y="{H - 7}" font-size="10" text-anchor="end" fill="var(--chart-ink-soft)">
			forecast {formatPence(forecast)}
		</text>
	</svg>
	<!-- segment legend (Phase 9 polish): explains the four zones -->
	<div class="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1 text-[10px] text-gray-500">
		<span class="flex items-center gap-1"><span class="w-3 h-2 border border-gray-300 bg-gray-100"></span>allowance zone</span>
		<span class="flex items-center gap-1"><span class="w-3 h-2 bg-gray-900"></span>actual</span>
		<span class="flex items-center gap-1"><span class="w-3 h-2 bg-gray-400"></span>projected</span>
		<span class="flex items-center gap-1"><span class="w-3 h-2 bg-red-700"></span>over allowance</span>
	</div>
</ChartPanel>
