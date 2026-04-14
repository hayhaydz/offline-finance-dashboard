<script lang="ts">
	import { MONTH_NAMES_SHORT } from "$lib/utils/domain-constants";
	interface TaxYearProgressData {
		taxYearStart: Date;
		taxYearEnd: Date;
	}

	let { data }: { data: TaxYearProgressData } = $props();

	const { daysElapsed, daysRemaining, endDateFormatted } = $derived.by(() => {
		const now = new Date();
		const start = new Date(data.taxYearStart);
		const end = new Date(data.taxYearEnd);
		
		const startTime = start.getTime();
		const endTime = end.getTime();
		const nowTime = now.getTime();
		
		const daysElapsed = Math.max(1, Math.floor((nowTime - startTime) / (1000 * 60 * 60 * 24)) + 1);
		const daysRemaining = 365 - daysElapsed;
		
		const endDay = end.getDate();
		const endMonth = MONTH_NAMES_SHORT[end.getMonth()];
		const endYear = end.getFullYear();
		const endDateFormatted = `${endDay} ${endMonth} ${endYear}`;
		
		return { daysElapsed, daysRemaining, endDateFormatted };
	});

	const percentComplete = $derived(Math.min(100, Math.max(0, (daysElapsed / 365) * 100)));

	const taxYearLabel = $derived(
		`${new Date(data.taxYearStart).getFullYear()}/${String(new Date(data.taxYearEnd).getFullYear()).slice(-2)}`
	);
</script>

<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>TAX YEAR: {taxYearLabel}</span>
</div>
<div class="border-b border-black p-2">
	<div class="flex justify-between text-sm mb-1">
		<span>Day {daysElapsed} of 365</span>
		<span class="tabular-nums">Ends {endDateFormatted}</span>
	</div>
	<div class="h-2 border border-black bg-white mb-2">
		<div
			class="h-full bg-gray-600"
			style={`width: ${percentComplete}%`}
		></div>
	</div>
	<div class="text-xs text-green-700 font-bold">
		{daysRemaining} days remaining
	</div>
</div>
