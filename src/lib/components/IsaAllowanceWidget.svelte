<script lang="ts">
	import { formatCurrency, formatCurrencyShorthand, formatDateShorthand } from '$lib/utils/currency';

	interface IsaAllowanceData {
		used: number;
		limit: number;
		remaining: number;
		taxYearStart: Date;
		taxYearEnd: Date;
	}

	let { data }: { data: IsaAllowanceData } = $props();

	const percentUsed = $derived(Math.min(100, (data.used / data.limit) * 100));
	const taxYearLabel = $derived(
		`${formatDateShorthand(data.taxYearStart)} to ${formatDateShorthand(data.taxYearEnd)}`
	);
</script>

<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>ISA ALLOWANCE TRACKER</span>
	<span class="text-xs font-normal">{taxYearLabel}</span>
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
</div>
