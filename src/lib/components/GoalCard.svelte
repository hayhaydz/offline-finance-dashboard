<script lang="ts">
	import { formatCurrencyShorthand, formatDate } from '$lib/utils/currency';
	import { getStaleness } from '$lib/utils/staleness';
	import type { Snippet } from 'svelte';

	// GoalDisplay interface - only the fields needed for display
	// This allows the component to work with partial Goal data from server queries
	interface GoalDisplay {
		name: string;
		slug: string;
		targetAmountInCents: number;
		currentAllocation: number;
		targetDate: Date | null;
		isEmergencyFund: boolean;
		updatedAt: Date;
	}

	interface Props {
		goal: GoalDisplay;
		showArchive?: boolean;
		headerActions?: Snippet;
	}

	let { goal, showArchive = false, headerActions }: Props = $props();

	// Calculate progress percentage
	const progress = $derived(
		goal.targetAmountInCents > 0
			? Math.min(100, Math.round((goal.currentAllocation / goal.targetAmountInCents) * 100))
			: 0
	);

	// Get progress bar color class based on percentage
	const progressColor = $derived(() => {
		if (progress >= 70) return 'green';
		if (progress >= 30) return 'amber';
		return 'red';
	});

	// Emergency Fund milestones (1mo = 8.33%, 3mo = 25%, 6mo = 50%, 12mo = 100%)
	const emergencyFundMilestones = $derived(() => {
		if (!goal.isEmergencyFund) return null;

		const monthlyExpenses = goal.targetAmountInCents / 12;
		const current = goal.currentAllocation;

		return [
			{ label: '1mo', achieved: current >= monthlyExpenses },
			{ label: '3mo', achieved: current >= monthlyExpenses * 3 },
			{ label: '6mo', achieved: current >= monthlyExpenses * 6 },
			{ label: '12mo', achieved: current >= monthlyExpenses * 12 }
		];
	});

	// Progress bar text color based on progress
	const progressTextColor = $derived(
		progressColor() === 'green' ? 'text-green-700' : progressColor() === 'amber' ? 'text-amber-600' : 'text-red-600'
	);

	// Progress bar background color
	const progressBgColor = $derived(
		progressColor() === 'green' ? 'bg-green-700' : progressColor() === 'amber' ? 'bg-amber-600' : 'bg-red-600'
	);

	const staleness = $derived(getStaleness(goal.updatedAt));
</script>

<div class="goal-card-content">
	<!-- Goal Name with Emergency Fund Badge -->
	<div class="flex justify-between items-center mb-1">
		<div class="flex items-start gap-1 min-w-0 overflow-hidden">
			{#if staleness}
					<span class="shrink-0 {staleness.cssClass}">●</span>
				{:else}
					<span class="shrink-0 text-gray-400">●</span>
				{/if}
			<span class="font-bold text-sm min-w-0 overflow-hidden">
				<a href="/goals/{goal.slug}" class="bracket-link block truncate">{goal.name}</a>
				{#if emergencyFundMilestones()}
					<span class="text-xs text-gray-500 font-normal">
						[
						{#each emergencyFundMilestones() as milestone, index}
							<span class={milestone.achieved ? 'text-green-700' : 'text-gray-400'}>{milestone.label}</span
							><span class="text-gray-400">{index < emergencyFundMilestones()!.length - 1 ? ' ' : ''}</span>
						{/each}
						]
					</span>
				{/if}
			</span>
		</div>
		{#if headerActions}
			<div class="flex gap-1 shrink-0">{@render headerActions()}</div>
		{/if}
	</div>

	<!-- Progress Bar (ASSET_CONTAINER style) -->
	<div class="flex items-center gap-2 text-sm leading-none font-bold {progressTextColor} mb-1">
		<span>[</span>
		<div class="flex-1 h-5 relative mt-px border-y border-gray-100">
			<div class="absolute inset-0 flex justify-between opacity-20">
				{#each Array(40) as _}
					<div class="w-px h-full bg-current"></div>
				{/each}
			</div>
			<div
				class="h-full {progressBgColor} transition-all duration-300 mix-blend-multiply"
				style="width: {progress}%"
			></div>
		</div>
		<span>]</span>
		<span class="text-xs text-gray-900 min-w-8 text-right font-bold">{progress}%</span>
	</div>

	<!-- Goal Details -->
	<div class="flex justify-between text-xs mb-1">
		<span class="font-bold text-gray-900"
			>{formatCurrencyShorthand(goal.currentAllocation)} of {formatCurrencyShorthand(goal.targetAmountInCents)}</span
		>
		<span class="font-bold {progressTextColor}">
			Remaining: {formatCurrencyShorthand(goal.targetAmountInCents - goal.currentAllocation)}
		</span>
	</div>

	<!-- Target Date (if set) -->
	{#if goal.targetDate}
		<div class="text-xs text-gray-600 mb-1">Target: {formatDate(new Date(goal.targetDate))}</div>
	{/if}

	<!-- Action Buttons -->
	<div class="flex gap-2 mt-2">
		<a href="/goals/{goal.slug}/add" class="bracket-link text-xs">Add Money</a>
		<a href="/goals/{goal.slug}/withdraw" class="bracket-link text-xs">Withdraw</a>
		{#if showArchive}
			<a href="/goals/{goal.slug}/confirm-archive" class="bracket-link text-xs text-red-700">Archive</a>
		{/if}
	</div>
</div>
