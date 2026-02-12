<script lang="ts">
	import { formatGoalProgress, getMilestonePositions, formatEmergencyFundRuler, getDaysRemaining } from '$lib/utils/goals';
	import { formatCurrency } from '$lib/utils/currency';
	import type { Goal } from '$lib/db/schema';
	import type { GoalProgress } from '$lib/server/goals';

	interface Props {
		goals: GoalProgress[];
		unallocatedAssets: number;
	}

	let { goals, unallocatedAssets }: Props = $props();

	interface EmergencyFundMilestone {
		label: string;
		amountInCents: number;
		percent: number;
	}

	interface FormattedGoal {
		goal: GoalProgress;
		formatted: ReturnType<typeof formatGoalProgress>;
		milestonePositions?: ReturnType<typeof getMilestonePositions>;
	}

	// Calculate Emergency Fund milestones (client-side)
	function calculateMilestones(monthlyExpensesInCents: number): EmergencyFundMilestone[] {
		if (monthlyExpensesInCents <= 0) return [];
		return [
			{ label: '1mo', amountInCents: monthlyExpensesInCents, percent: 8.33 },
			{ label: '3mo', amountInCents: monthlyExpensesInCents * 3, percent: 25 },
			{ label: '6mo', amountInCents: monthlyExpensesInCents * 6, percent: 50 },
			{ label: '12mo', amountInCents: monthlyExpensesInCents * 12, percent: 100 }
		];
	}

	// Enrich each goal with display data
	const enrichedGoals = $derived(() => {
		return goals.map((goalProgress) => {
			const formatted = formatGoalProgress({
				current: goalProgress.currentAmountInCents,
				target: goalProgress.targetAmountInCents,
				percent: goalProgress.progressPercent
			});

			const result: FormattedGoal = {
				goal: goalProgress,
				formatted
			};

			// For Emergency Fund goals, calculate milestone positions
			if (goalProgress.goal.isEmergencyFund) {
				// Use targetAmountInCents to derive monthly expenses (12mo = 100%)
				const monthlyExpenses = goalProgress.targetAmountInCents / 12;
				const milestones = calculateMilestones(monthlyExpenses);
				result.milestonePositions = getMilestonePositions({
					milestones,
					targetAmount: goalProgress.targetAmountInCents,
					currentAmount: goalProgress.currentAmountInCents
				});
			}

			return result;
		});
	});
</script>

<!-- GOALS SECTION -->
<div class="border-b border-black p-2">
	<div class="text-lg font-bold mb-1">GOALS</div>

	{#if enrichedGoals().length === 0}
		<div class="flex justify-between my-1">
			<span class="text-gray-600">No goals yet</span>
			<a href="/goals" class="bracket-link">[Manage Goals]</a>
		</div>
	{:else}
		{#each enrichedGoals() as enrichedGoal}
			{@const isEmergencyFund = enrichedGoal.goal.isEmergencyFund}
			{@const display = enrichedGoal.formatted}
			{@const goal = enrichedGoal.goal.goal}

			<!-- Goal Header -->
			<div class="flex justify-between my-1">
				<span class="font-bold">{goal.name}{#if goal.isEmergencyFund}<span class="text-gray-600 text-xs ml-1">(Emergency Fund)</span>{/if}</span>
				{#if display.isComplete}
					<span class="text-green-700">{display.completeText}</span>
				{:else}
					<span class="text-gray-600 text-xs">{getDaysRemaining(goal.targetDate)}</span>
				{/if}
			</div>

			<!-- Progress Bar -->
			{#if isEmergencyFund && enrichedGoal.milestonePositions}
				<!-- Emergency Fund with milestone markers -->
				<div class="my-1">
					<div class={display.colorClass}>
						{formatEmergencyFundRuler({
							percent: enrichedGoal.goal.progressPercent,
							milestones: enrichedGoal.milestonePositions.positions
						})}
					</div>
					<!-- Milestone labels -->
					<div class="text-xs text-gray-600 tabular-nums">
						{#each enrichedGoal.milestonePositions.positions as pos, index}
							<span style="margin-left: {pos.percent * 2}px">{pos.label}</span>
							{#if index < enrichedGoal.milestonePositions.positions.length - 1}
								<span class="mx-1"></span>
							{/if}
						{/each}
					</div>
				</div>
			{:else}
				<!-- Regular goal progress bar -->
				<div class="my-1 {display.colorClass}">
					<div class="tabular-nums">{display.progressBar}</div>
					<div class="text-xs mt-1">{display.displayString}</div>
				</div>
			{/if}

			<!-- Separator between goals -->
			<div class="border-t border-gray-200 my-2"></div>
		{/each}

		<!-- Unallocated Assets -->
		{#if unallocatedAssets > 0}
			<div class="flex justify-between my-1 text-gray-600">
				<span>Unallocated assets</span>
				<span>{formatCurrency(unallocatedAssets)}</span>
			</div>
		{/if}

		<!-- Manage Goals Link -->
		<div class="mt-2">
			<a href="/goals" class="bracket-link">[Manage Goals]</a>
		</div>
	{/if}
</div>
