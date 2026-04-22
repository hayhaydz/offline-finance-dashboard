<script lang="ts">
	import { formatCurrencyShorthand, formatDateShorthand } from '$lib/utils/currency';
	import { getStaleness } from '$lib/utils/staleness';

	interface Props {
		name: string;
		slug: string;
		paidInCents: number;
		remainingInCents: number;
		percent: number;
		projectedPayoffDate: Date | null;
		updatedAt: Date;
	}

	let { name, slug, paidInCents, remainingInCents, percent, projectedPayoffDate, updatedAt }: Props =
		$props();

	const staleness = $derived(getStaleness(updatedAt));

	const progressColor = $derived(
		percent >= 70
			? { text: 'text-green-700', bg: 'bg-green-700' }
			: percent >= 30
				? { text: 'text-amber-600', bg: 'bg-amber-600' }
				: { text: 'text-red-600', bg: 'bg-red-600' },
	);
</script>

<div class="goal-card-content">
	<!-- Name -->
	<div class="flex justify-between items-center mb-1">
		<div class="flex items-center gap-1 min-w-0 overflow-hidden">
			{#if staleness}
					<span class="shrink-0 {staleness.cssClass}">●</span>
				{:else}
					<span class="shrink-0 text-gray-400">●</span>
				{/if}
			<span class="font-bold text-sm min-w-0 overflow-hidden">
				<a href="/goals/debt/{slug}" class="bracket-link block truncate">{name}</a>
			</span>
		</div>
	</div>

	<!-- Progress bar -->
	<div class="flex items-center gap-2 text-sm leading-none font-bold {progressColor.text} mb-1">
		<span>[</span>
		<div class="flex-1 h-5 relative mt-px border-y border-gray-100">
			<div class="absolute inset-0 flex justify-between opacity-20">
				{#each Array(40) as _}
					<div class="w-px h-full bg-current"></div>
				{/each}
			</div>
			<div
				class="h-full {progressColor.bg} transition-all duration-300 mix-blend-multiply"
				style="width: {Math.min(100, Math.max(0, percent))}%"
			></div>
		</div>
		<span>]</span>
		<span class="text-xs text-gray-900 min-w-8 text-right font-bold">{Math.round(percent)}% paid</span>
	</div>

	<!-- Amounts + debt-free date -->
	<div class="flex justify-between text-xs">
		<span class="font-bold text-gray-900">
			{formatCurrencyShorthand(paidInCents)} paid
		</span>
		<span class="font-bold {progressColor.text}">
			{formatCurrencyShorthand(remainingInCents)} left
		</span>
		{#if projectedPayoffDate}
			<span class="text-gray-600">
				{formatDateShorthand(projectedPayoffDate)}
			</span>
		{/if}
	</div>
</div>
