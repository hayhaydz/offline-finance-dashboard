<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import GoalRow from '$lib/components/GoalRow.svelte';
	import type { Goal } from '$lib/db/schema';

	let { data } = $props();

	// Calculate progress percentage for a goal
	function getProgress(goal: Goal): number {
		return goal.targetAmountInCents > 0
			? Math.min(100, Math.round((goal.currentAllocation / goal.targetAmountInCents) * 100))
			: 0;
	}

	// Get progress color class based on percentage
	function getProgressColor(progress: number): { text: string; bg: string } {
		if (progress >= 70) return { text: 'text-green-700', bg: 'bg-green-700' };
		if (progress >= 30) return { text: 'text-amber-600', bg: 'bg-amber-600' };
		return { text: 'text-red-600', bg: 'bg-red-600' };
	}

	// Get emergency fund milestones display
	function getEmergencyFundMilestones(goal: Goal) {
		if (!goal.isEmergencyFund) return null;

		const monthlyExpenses = goal.targetAmountInCents / 12;
		const current = goal.currentAllocation;

		return [
			{ label: '1mo', achieved: current >= monthlyExpenses },
			{ label: '3mo', achieved: current >= monthlyExpenses * 3 },
			{ label: '6mo', achieved: current >= monthlyExpenses * 6 },
			{ label: '12mo', achieved: current >= monthlyExpenses * 12 }
		];
	}
</script>

<!-- ARCHIVED GOALS LIST SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span><span class="text-gray-600">●</span> ARCHIVED ({data.goals.length})</span>
	<a href="/goals" class="bracket-link text-xs">Back to Goals</a>
</div>

<div class="p-0">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs p-2">
			No archived goals yet. Goals are archived when you delete them from the active list.
		</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="pl-2 text-left">Goal</th>
					<th class="text-right pr-1">Progress</th>
					<th class="text-right pr-1">Target</th>
					<th class="text-right pr-1">Date Archived</th>
				</tr>
			</thead>
			<tbody>
				{#each data.goals as goal}
					{@const progress = getProgress(goal)}
					{@const progressColor = getProgressColor(progress)}
					{@const milestones = getEmergencyFundMilestones(goal)}
					<GoalRow
						{goal}
						{progress}
						{progressColor}
						{milestones}
						showArchivedDate={true}
						showActions={false}
						isArchived={true}
					/>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
