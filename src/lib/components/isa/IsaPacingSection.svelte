<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import type { ISAPacingResult } from '$lib/server/isaPacing';

	let { pacing }: { pacing: ISAPacingResult } = $props();
</script>

<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2 text-xs uppercase flex justify-between">
		<span>ISA Pacing — {pacing.taxYearLabel}</span>
		<span
			class="font-bold"
			class:text-green-700={pacing.status === 'full' || pacing.status === 'on-track'}
			class:text-amber-700={pacing.status === 'behind'}
			class:text-gray-400={pacing.status === 'no-data'}
		>
			{pacing.status === 'full' ? 'FULL' : pacing.status === 'on-track' ? 'ON TRACK' : pacing.status === 'behind' ? 'BEHIND' : 'NO DATA'}
		</span>
	</div>
	{#if pacing.status === 'no-data'}
		<div class="p-2 text-xs text-gray-500">No ISA deposits recorded this tax year yet.</div>
	{:else if pacing.status === 'full'}
		<div class="p-2 text-xs text-green-700 font-bold">ISA allowance fully used — well done!</div>
	{:else}
		<div class="grid grid-cols-2 md:grid-cols-4">
			<div class="border-r border-black p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Avg / Month</div>
				<div class="text-lg font-bold">{formatCurrency(pacing.actualMonthlyAvgInCents)}</div>
				<div class="text-[10px] text-gray-500">actual so far</div>
			</div>
			<div class="border-r border-black p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">{pacing.isLastMonth ? 'Required Total' : 'Required / Month'}</div>
				<div
					class="text-lg font-bold"
					class:text-amber-700={pacing.status === 'behind'}
					class:text-green-700={pacing.status === 'on-track'}
				>
					{formatCurrency(pacing.requiredMonthlyInCents)}
				</div>
				<div class="text-[10px] text-gray-500">to reach £20k</div>
			</div>
			<div class="border-r border-black p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Months Elapsed</div>
				<div class="text-lg font-bold">{pacing.monthsElapsed}</div>
				<div class="text-[10px] text-gray-500">
					{#if pacing.isLastMonth && pacing.daysRemainingInTaxYear > 0}
						{pacing.daysRemainingInTaxYear}d remaining
					{:else}
						{pacing.monthsRemaining} remaining
					{/if}
				</div>
			</div>
			<div class="p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Remaining</div>
				<div class="text-lg font-bold text-green-700">{formatCurrency(pacing.allowanceRemainingInCents)}</div>
				<div class="text-[10px] text-gray-500">{pacing.daysRemainingInTaxYear}d left</div>
			</div>
		</div>
		{#if pacing.status === 'behind'}
			<div class="border-t border-black p-2 text-xs text-amber-700">
				{#if pacing.isLastMonth}
					You need to deposit {formatCurrency(pacing.allowanceRemainingInCents)} in the next {pacing.daysRemainingInTaxYear} days to use the full allowance.
				{:else}
					You need to deposit an extra {formatCurrency(pacing.requiredMonthlyInCents - pacing.actualMonthlyAvgInCents)} / month above your current average to use the full allowance.
				{/if}
			</div>
		{/if}
	{/if}
</div>
