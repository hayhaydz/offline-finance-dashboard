<script lang="ts">
	import { formatCurrency, formatCurrencyShorthand } from '$lib/utils/currency';
	import type { ISAPacingResult } from '$lib/server/isaPacing';

	interface IsaAllowanceData {
		used: number;
		limit: number;
		remaining: number;
		taxYearStart: Date;
		taxYearEnd: Date;
		pacing?: ISAPacingResult;
	}

	let { data }: { data: IsaAllowanceData } = $props();

	const percentUsed = $derived(Math.min(100, (data.used / data.limit) * 100));

	// Current tax year slug for breakdown link
	const currentYearSlug = $derived(
		new Date(data.taxYearStart).getUTCFullYear() +
			'-' +
			String(new Date(data.taxYearEnd).getUTCFullYear()).slice(-2)
	);

	const pacing = $derived(data.pacing);

	const pacingStatusClass = $derived(() => {
		if (!pacing) return '';
		if (pacing.status === 'full' || pacing.status === 'on-track') return 'text-green-700';
		if (pacing.status === 'behind') return 'text-amber-700';
		return 'text-gray-400';
	});

	const pacingLabel = $derived(() => {
		if (!pacing) return '';
		if (pacing.status === 'full') return 'FULL';
		if (pacing.status === 'on-track') return 'ON TRACK';
		if (pacing.status === 'behind') return 'BEHIND';
		return 'NO DATA';
	});
</script>

<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
	<span>ISA ALLOWANCE</span>
	<div class="flex items-center gap-2">
		<a href="/accounts/isa/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
	</div>
</div>
<div class="border-b border-black p-2">
	<div class="flex justify-between text-sm mb-1">
		<span>Used</span>
		<span class="tabular-nums">
			{formatCurrencyShorthand(data.used)} / {formatCurrencyShorthand(data.limit)}
		</span>
	</div>
	<div class="h-2 border border-black bg-white mb-2">
		<div
			class="h-full bg-green-700"
			style={`width: ${percentUsed}%`}
		></div>
	</div>
	<div class="text-xs {data.remaining > 0 ? 'text-green-700' : 'text-red-700 font-bold'}">
		{#if data.remaining > 0}
			{formatCurrency(data.remaining)} remaining this tax year
		{:else}
			Allowance fully used this tax year
		{/if}
	</div>

	{#if pacing && pacing.status !== 'full'}
		<div class="mt-2 pt-2 border-t border-gray-200">
			<div class="flex justify-between items-center text-xs">
				<span class="text-gray-500 uppercase">Pacing</span>
				<span class="font-bold {pacingStatusClass()}">{pacingLabel()}</span>
			</div>
			{#if pacing.status !== 'no-data'}
				<div class="flex justify-between text-xs mt-0.5 tabular-nums">
					<span class="text-gray-500">Avg/month</span>
					<span>{formatCurrencyShorthand(pacing.actualMonthlyAvgInCents)}</span>
				</div>
				<div class="flex justify-between text-xs tabular-nums">
					<span class="text-gray-500">{pacing.isLastMonth ? 'Target total' : 'Target/month'}</span>
					<span class:text-amber-700={pacing.status === 'behind'}>
						{formatCurrencyShorthand(pacing.requiredMonthlyInCents)}
					</span>
				</div>
			{:else}
				<div class="text-xs text-gray-400 mt-0.5">No ISA deposits this tax year yet</div>
			{/if}
			<div class="text-xs text-gray-400 mt-0.5">{pacing.daysRemainingInTaxYear}d remaining</div>
		</div>
	{/if}
</div>
