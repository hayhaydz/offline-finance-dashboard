<script lang="ts">
	import { formatCurrency, formatDate } from '$lib/utils/currency';
	import type { Goal } from '$lib/db/schema';

	let { data } = $props<{
		data: {
			goals: Goal[];
			readyToAssign: number;
			totalAssets: number;
			totalAllocated: number;
			user: { id: number; username: string; createdAt: Date };
		};
	}>();

	// Calculate progress percentage for a goal
	function calculateProgress(current: number, target: number): number {
		if (target === 0) return 0;
		return Math.min(100, (current / target) * 100);
	}

	// Get progress bar color class based on percentage
	function getProgressColorClass(percent: number): string {
		if (percent >= 70) return 'green';
		if (percent >= 30) return 'amber';
		return 'red';
	}

	// Calculate Emergency Fund milestones (monthly expenses = target / 12)
	function getEmergencyFundMilestones(goal: Goal) {
		if (!goal.isEmergencyFund) return null;

		const monthlyExpenses = goal.targetAmountInCents / 12;
		const current = goal.currentAllocation;

		return [
			{ label: '1mo', amount: monthlyExpenses, achieved: current >= monthlyExpenses },
			{ label: '3mo', amount: monthlyExpenses * 3, achieved: current >= monthlyExpenses * 3 },
			{ label: '6mo', amount: monthlyExpenses * 6, achieved: current >= monthlyExpenses * 6 },
			{ label: '12mo', amount: monthlyExpenses * 12, achieved: current >= monthlyExpenses * 12 }
		];
	}

	// Format Emergency Fund milestone display
	function formatMilestoneDisplay(goal: Goal): string {
		const milestones = getEmergencyFundMilestones(goal);
		if (!milestones) return '';

		return milestones
			.map(
				(m) =>
					`<span class="${m.achieved ? 'text-green-700' : 'text-gray-500'}">${m.label}</span>`
			)
			.join(' ');
	}
</script>

<div class="border-b border-black p-2">
	<div class="flex justify-between items-center">
		<h1 class="text-lg font-bold mb-0 mt-0">ARCHIVED GOALS</h1>
		<span class="text-xs text-gray-600">{data.goals.length} archived</span>
	</div>
	<p class="text-gray-600 my-1">View your previously archived savings goals</p>
</div>

<!-- ARCHIVED GOALS LIST SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span><span class="text-gray-600">●</span> ARCHIVED ({data.goals.length})</span>
	<span class="text-xs text-gray-600">Read-only view</span>
</div>

<div class="border-b border-black p-2">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs mb-2">
			No archived goals yet. Goals are archived when you delete them from the active list.
		</p>
	{:else}
		{#each data.goals as goal}
			<div class="border border-black p-2 mb-2 last:mb-0 bg-gray-50">
				<!-- Goal Header -->
				<div class="flex justify-between items-center mb-1">
					<span class="font-bold text-sm">
						{goal.name}
						{#if goal.isEmergencyFund}
							<span class="text-xs text-gray-600 font-normal ml-1">
								{@html formatMilestoneDisplay(goal)}
							</span>
						{/if}
					</span>
					<span class="text-xs text-red-700">ARCHIVED</span>
				</div>

				<!-- Progress Bar (read-only, same style as active goals) -->
				<div class="flex items-center gap-2 text-sm leading-none font-bold {getProgressColorClass(calculateProgress(goal.currentAllocation, goal.targetAmountInCents)) === 'green' ? 'text-green-700' : getProgressColorClass(calculateProgress(goal.currentAllocation, goal.targetAmountInCents)) === 'amber' ? 'text-amber-600' : 'text-red-600'} my-1">
					<span>[</span>
					<div class="flex-1 h-5 relative mt-px border-y border-gray-100">
						<div class="absolute inset-0 flex justify-between opacity-20">
							{#each Array(40) as _} <div class="w-[1px] h-full bg-current"></div> {/each}
						</div>
						<div class="h-full {getProgressColorClass(calculateProgress(goal.currentAllocation, goal.targetAmountInCents)) === 'green' ? 'bg-green-700' : getProgressColorClass(calculateProgress(goal.currentAllocation, goal.targetAmountInCents)) === 'amber' ? 'bg-amber-600' : 'bg-red-600'} transition-all duration-300 mix-blend-multiply" style="width: {Math.round(calculateProgress(goal.currentAllocation, goal.targetAmountInCents))}%"></div>
					</div>
					<span>]</span>
					<span class="text-xs text-gray-600 min-w-10 text-right font-normal">{Math.round(calculateProgress(goal.currentAllocation, goal.targetAmountInCents))}%</span>
				</div>

				<!-- Goal Details -->
				<div class="flex justify-between text-xs mt-1">
					<span>
						{formatCurrency(goal.currentAllocation)} of
						{formatCurrency(goal.targetAmountInCents)} target
					</span>
					<span
						class="{getProgressColorClass(calculateProgress(goal.currentAllocation, goal.targetAmountInCents))} font-bold"
					>
						At archival: {formatCurrency(goal.currentAllocation)}
					</span>
				</div>

				<!-- Archived Date -->
				{#if goal.deletedAt}
					<div class="text-xs text-gray-600 mt-1">
						Archived: {formatDate(new Date(goal.deletedAt))}
					</div>
				{/if}

				<!-- Target Date (if set) -->
				{#if goal.targetDate}
					<div class="text-xs text-gray-600">
						Target was: {formatDate(new Date(goal.targetDate))}
					</div>
				{/if}
			</div>
		{/each}
	{/if}

	<!-- Back to Goals Button -->
	<div class="flex justify-end mt-4">
		<a href="/goals" class="bracket-link text-xs">[Back to Goals]</a>
	</div>
</div>
