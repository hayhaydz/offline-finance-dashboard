<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { formatAccountType } from '$lib/utils/currency';
	import { truncateDisplay } from '$lib/utils/fieldLimits';
	import { DISPLAY_LIMITS } from '$lib/utils/fieldLimits';

	let {
		slug,
		name,
		type,
		taxWrapper,
		institution,
		liquidity,
		balance,
		closedAt,
		openedAt,
		currentRate,
		boeBaseRate,
		rateSpread,
		balanceDelta1m,
		balanceDelta12m,
		category,
	}: {
		slug: string;
		name: string;
		type: string;
		taxWrapper: string;
		institution: string | null;
		liquidity: string | null;
		balance: number;
		closedAt: Date | null;
		openedAt: Date | null;
		currentRate: number | null;
		boeBaseRate: number | null;
		rateSpread: number | null;
		balanceDelta1m: number | null;
		balanceDelta12m: number | null;
		category: string;
	} = $props();

	const accountAge = $derived.by(() => {
		if (!openedAt) return null;
		const opened = new Date(openedAt);
		const now = new Date();
		const totalMonths =
			(now.getFullYear() - opened.getFullYear()) * 12 +
			(now.getMonth() - opened.getMonth());
		if (totalMonths < 0) return null;
		const years = Math.floor(totalMonths / 12);
		const months = totalMonths % 12;
		const monthLabel = opened.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
		return { years, months, monthLabel };
	});

	const spreadColour = $derived.by(() => {
		if (rateSpread === null) return '';
		if (category === 'liability') {
			return rateSpread > 0 ? 'text-red-700' : 'text-green-700';
		}
		return rateSpread >= 0 ? 'text-green-700' : 'text-amber-700';
	});

	const isLiability = $derived(category === 'liability');
</script>

<div class="p-2">
	<div class="flex justify-between items-center gap-2 mb-2">
		<h2 class="text-base font-bold m-0 min-w-0 overflow-hidden">
			<span class="truncate block">
				{name}
				{#if closedAt}
					<span class="text-xs font-normal text-gray-500 ml-1">[CLOSED]</span>
				{/if}
			</span>
		</h2>
		{#if !closedAt}
		<div class="flex gap-2 shrink-0">
			<a href="/accounts/{slug}/edit" class="bracket-link text-xs">Edit</a>
			<a href="/accounts/{slug}/delete" class="bracket-link text-xs text-red-700">Close</a>
		</div>
	{/if}
	</div>
	<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
		<div>Type:</div>
		<div>{formatAccountType(type)}</div>
		<div>Tax Wrapper:</div>
		<div>{taxWrapper === 'none' ? '-' : taxWrapper.toUpperCase()}</div>
		<div>Institution:</div>
		<div>{truncateDisplay(institution || '-', DISPLAY_LIMITS.INSTITUTION_NAME)}</div>
		<div>Liquidity:</div>
		<div class="capitalize">{liquidity ?? '-'}</div>
		<div>Current Balance:</div>
		<div class="font-bold {balance >= 0 ? 'text-green-700' : 'text-red-700'}">{formatCurrency(balance)}</div>
		{#if accountAge}
			<div>Opened:</div>
			<div>{accountAge.monthLabel} · Age: {accountAge.years}y {accountAge.months}m</div>
		{/if}
	</div>
	{#if rateSpread !== null && currentRate !== null && boeBaseRate !== null}
		<div class="text-xs mt-1 text-gray-600">
			Rate: {(currentRate / 100).toFixed(2)}%
			<span class="text-gray-400 mx-1">·</span>
			BoE base: {(boeBaseRate / 100).toFixed(2)}%
			<span class="text-gray-400 mx-1">·</span>
			Spread: <span class={spreadColour}>{rateSpread >= 0 ? '+' : ''}{(rateSpread / 100).toFixed(2)}%</span>
		</div>
	{/if}
	{#if balanceDelta1m !== null}
		{@const delta1mAbs = formatCurrency(Math.abs(balanceDelta1m))}
		{@const delta1mUp = balanceDelta1m > 0}
		{@const delta1mGood = isLiability ? !delta1mUp : delta1mUp}
		{@const delta1mColour = delta1mGood ? 'text-green-700' : 'text-red-700'}
		<div class="text-xs mt-1 tabular-nums text-gray-600 flex gap-3 flex-wrap">
			<span class={delta1mColour}>
				{delta1mUp ? '▲' : '▼'} {delta1mAbs}
				{isLiability && !delta1mUp ? 'repaid this month' : 'from last month'}
			</span>
			{#if balanceDelta12m !== null}
				{@const delta12mAbs = formatCurrency(Math.abs(balanceDelta12m))}
				{@const delta12mUp = balanceDelta12m > 0}
				{@const delta12mGood = isLiability ? !delta12mUp : delta12mUp}
				{@const delta12mColour = delta12mGood ? 'text-green-700' : 'text-red-700'}
				<span class="text-gray-400">|</span>
				<span class={delta12mColour}>
					{delta12mUp ? '▲' : '▼'} {delta12mAbs} from 12 months ago
				</span>
			{:else}
				<span class="text-gray-400">|</span>
				<span class="text-gray-400">— from 12 months ago</span>
			{/if}
		</div>
	{/if}
</div>
