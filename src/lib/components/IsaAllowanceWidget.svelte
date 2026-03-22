<script lang="ts">
	import { formatCurrency, formatCurrencyShorthand } from '$lib/utils/currency';

	interface IsaAllowanceData {
		used: number;
		limit: number;
		remaining: number;
		taxYearStart: Date;
		taxYearEnd: Date;
	}

	let { data }: { data: IsaAllowanceData } = $props();

	const percentUsed = $derived(Math.min(100, (data.used / data.limit) * 100));

	// Current tax year slug for breakdown link
	const currentYearSlug = $derived(
		new Date(data.taxYearStart).getUTCFullYear() +
			'-' +
			String(new Date(data.taxYearEnd).getUTCFullYear()).slice(-2)
	);
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
</div>
