<script lang="ts">
	import { MONTH_NAMES_SHORT } from "$lib/utils/domain-constants";
	import { formatCurrencyShorthand, formatCurrency } from "$lib/utils/currency";
	import type { ISAPacingResult } from "$lib/server/isaPacing";

	/**
	 * TaxYearTimeline (v3.1 A02 / doctrine D3 canonical rebuild): the UK
	 * tax year as a full-width 12-month timeline strip — elapsed months
	 * shaded, the current month partially filled with a today marker,
	 * future months empty — with the ISA allowance + pacing stated in a
	 * second lane of the same panel. Replaces the 3/2 grid pair whose
	 * ~70px TaxYearProgress sat centered in a stretched cell (the v3
	 * dead-space emblem). Every cell is a real month; no filler.
	 */
	interface TaxYearTimelineData {
		used: number;
		limit: number;
		remaining: number;
		taxYearStart: Date;
		taxYearEnd: Date;
		pacing?: ISAPacingResult;
	}

	let { data }: { data: TaxYearTimelineData } = $props();

	const start = $derived(new Date(data.taxYearStart));
	const end = $derived(new Date(data.taxYearEnd));
	const now = $derived(new Date());

	const taxYearLabel = $derived(
		`${start.getFullYear()}/${String(end.getFullYear()).slice(-2)}`
	);

	const daysElapsed = $derived(
		Math.min(365, Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1))
	);
	const daysRemaining = $derived(Math.max(0, 365 - daysElapsed));
	const endDateFormatted = $derived(
		`${end.getDate()} ${MONTH_NAMES_SHORT[end.getMonth()]} ${end.getFullYear()}`
	);
	const percentComplete = $derived(Math.min(100, (daysElapsed / 365) * 100));

	// The 12 months of the tax year (UK: April → March), oldest → newest.
	type MonthCell = {
		label: string;
		state: "past" | "current" | "future";
		fillPct: number;
	};
	const months = $derived.by(() => {
		const startMonth = start.getMonth();
		const cells: MonthCell[] = [];
		for (let i = 0; i < 12; i++) {
			const d = new Date(start.getFullYear(), startMonth + i, 1);
			const next = new Date(start.getFullYear(), startMonth + i + 1, 1);
			const isPast = next <= now;
			const isCurrent = d <= now && now < next;
			const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
			cells.push({
				label: MONTH_NAMES_SHORT[d.getMonth()].toUpperCase(),
				state: isPast ? "past" : isCurrent ? "current" : "future",
				fillPct: isPast ? 100 : isCurrent ? (now.getDate() / daysInMonth) * 100 : 0,
			});
		}
		return cells;
	});

	const isaPercentUsed = $derived(
		data.limit > 0 ? Math.min(100, (data.used / data.limit) * 100) : 0
	);

	const currentYearSlug = $derived(
		`${start.getUTCFullYear()}-${String(end.getUTCFullYear()).slice(-2)}`
	);

	const pacing = $derived(data.pacing);
	const pacingLabel = $derived.by(() => {
		if (!pacing) return "";
		if (pacing.status === "full") return "FULL";
		if (pacing.status === "on-track") return "ON TRACK";
		if (pacing.status === "behind") return "BEHIND";
		return "NO DATA";
	});
	const pacingClass = $derived.by(() => {
		if (!pacing) return "";
		if (pacing.status === "full" || pacing.status === "on-track") return "text-green-700";
		if (pacing.status === "behind") return "text-amber-700";
		return "text-gray-500";
	});
</script>

<div class="border border-black">
	<!-- header: the year at a glance -->
	<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2 gap-4">
		<span class="whitespace-nowrap">TAX YEAR: {taxYearLabel}</span>
		<span class="text-xs font-normal text-gray-600 tabular-nums whitespace-nowrap flex gap-3 flex-wrap">
			<span>Day {daysElapsed} of 365</span>
			<span>{daysRemaining} days remaining</span>
			<span>ends {endDateFormatted}</span>
			<span class="hidden sm:inline text-gray-400">{Math.round(percentComplete)}% elapsed</span>
		</span>
		<a href="/accounts/isa/{currentYearSlug}" class="bracket-link text-xs whitespace-nowrap">ISA Breakdown</a>
	</div>

	<!-- lane 1: the 12-month timeline -->
	<div class="grid grid-cols-12 border-b border-black">
		{#each months as m, i (i)}
			<div
				class="relative h-10 border-r border-gray-200 last:border-r-0 {m.state === 'future'
					? 'bg-white'
					: ''}"
				title="{m.label} — {m.state}"
			>
				<span class="absolute top-0.5 left-1 text-[9px] font-bold {m.state === 'future'
					? 'text-gray-400'
					: 'text-gray-700'}">{m.label}</span>
				{#if m.fillPct > 0}
					<div class="absolute bottom-0 left-0 h-3 bg-gray-500" style={`width: ${m.fillPct}%`}></div>
				{/if}
				{#if m.state === 'current'}
					<!-- today marker: hairline at the fill edge -->
					<div class="absolute bottom-0 h-5 w-px bg-black" style={`left: ${m.fillPct}%`}></div>
					<span class="absolute bottom-0.5 left-1 text-[9px] font-bold text-black">TODAY</span>
				{/if}
			</div>
		{/each}
	</div>

	<!-- lane 2: ISA allowance + pacing in the same width -->
	<div class="p-2 flex items-center gap-3 text-xs flex-wrap">
		<span class="font-bold whitespace-nowrap">ISA ALLOWANCE</span>
		<div class="h-2 border border-black bg-white w-48 shrink-0">
			<div class="h-full bg-green-700" style={`width: ${isaPercentUsed}%`}></div>
		</div>
		<span class="tabular-nums whitespace-nowrap">
			{formatCurrencyShorthand(data.used)} / {formatCurrencyShorthand(data.limit)} used
		</span>
		<span class="tabular-nums {data.remaining > 0 ? 'text-green-700' : 'text-red-700 font-bold'} whitespace-nowrap">
			{data.remaining > 0 ? `${formatCurrency(data.remaining)} remaining` : "allowance fully used"}
		</span>
		{#if pacing && pacing.status !== "full"}
			<span class="font-bold {pacingClass} whitespace-nowrap">{pacingLabel}</span>
			{#if pacing.status !== "no-data"}
				<span class="text-gray-600 tabular-nums whitespace-nowrap">
					avg {formatCurrencyShorthand(pacing.actualMonthlyAvgInCents)}/mo ·
					target {formatCurrencyShorthand(pacing.requiredMonthlyInCents)}/mo
				</span>
			{:else}
				<span class="text-gray-500 whitespace-nowrap">no ISA deposits this tax year yet</span>
			{/if}
		{/if}
	</div>
</div>
