<script lang="ts">
	import { formatCurrency, formatDate } from '$lib/utils/currency';
	import type { Goal } from '$lib/db/schema';
	import { invalidate } from '$app/navigation';

	let { data } = $props<{
		data: {
			goals: Goal[];
			readyToAssign: number;
			totalAssets: number;
			totalAllocated: number;
			user: { id: number; username: string; createdAt: Date };
		};
	}>();

	// Reactive goals array for client-side reordering
	let goals = $state<Goal[]>([]);
	let moving = $state<Set<string>>(new Set());

	// Sync goals with server data
	$effect(() => {
		goals = [...data.goals];
	});

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

	// Move goal up or down (client-side fetch for smooth reordering)
	async function moveGoal(slug: string, direction: 'up' | 'down', index: number) {
		console.log(`[move${direction}] Starting`, { slug, index, currentOrder: goals.map(g => ({ slug: g.slug, sortOrder: g.sortOrder })) });

		moving.add(slug);

		try {
			const formData = new FormData();
			formData.append('slug', slug);

			const actionName = direction === 'up' ? 'moveUp' : 'moveDown';
			console.log(`[move${direction}] Posting to`, { actionName, url: `/goals?/${actionName}` });

			const response = await fetch(`/goals?/${actionName}`, {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				console.error(`[move${direction}] Failed`, error);
				alert(error.error || 'Failed to move goal');
				return;
			}

			console.log(`[move${direction}] Server responded OK`);

			// Update local state for smooth visual feedback
			if (direction === 'up' && index > 0) {
				const temp = goals[index];
				goals[index] = goals[index - 1];
				goals[index - 1] = temp;
				console.log(`[move${direction}] Client state updated (swapped ${index} with ${index - 1})`);
			} else if (direction === 'down' && index < goals.length - 1) {
				const temp = goals[index];
				goals[index] = goals[index + 1];
				goals[index + 1] = temp;
				console.log(`[move${direction}] Client state updated (swapped ${index} with ${index + 1})`);
			}

			console.log(`[move${direction}] New order`, { newOrder: goals.map(g => ({ slug: g.slug, sortOrder: g.sortOrder })) });
		} finally {
			moving.delete(slug);
			console.log(`[move${direction}] Complete`);
		}
	}
</script>

<div class="border-b border-black p-2">
	<div class="flex justify-between items-center">
		<h1 class="text-lg font-bold mb-0 mt-0">SAVINGS GOALS</h1>
		<span class="text-xs text-gray-600">{data.goals.length} active</span>
	</div>
	<p class="text-gray-600 my-1">Allocate funds across your savings goals</p>
</div>

<!-- READY TO ASSIGN SECTION -->
<div class="border-b border-black bg-gray-50 p-2">
	<div class="flex justify-between items-center mb-1">
		<span class="text-xs tracking-widest font-bold">READY TO ASSIGN</span>
		<span class="text-xs text-gray-500">{formatCurrency(data.readyToAssign)}</span>
	</div>
	<div class="text-xs text-gray-600">
		{formatCurrency(data.totalAssets)} assets - {formatCurrency(data.totalAllocated)} allocated
	</div>
</div>

<!-- GOALS LIST SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span><span class="text-green-700">●</span> GOALS ({data.goals.length})</span>
	<span class="text-xs text-gray-600">Last updated: Today</span>
</div>

<div class="border-b border-black p-2">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs mb-2">
			No goals yet. Create your first goal to start tracking.
		</p>
	{:else}
		{#each goals as goal, index}
			<div class="border border-black p-2 mb-2 last:mb-0">
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
					<!-- Reorder Buttons -->
					<div class="flex gap-1">
						<button
							type="button"
							onclick={() => moveGoal(goal.slug, 'up', index)}
							class="bracket-link text-xs"
							title="Move up"
							disabled={index === 0 || moving.has(goal.slug)}
							class:opacity-50={index === 0 || moving.has(goal.slug)}
						>
							[↑]
						</button>
						<button
							type="button"
							onclick={() => moveGoal(goal.slug, 'down', index)}
							class="bracket-link text-xs ml-1"
							title="Move down"
							disabled={index === goals.length - 1 || moving.has(goal.slug)}
							class:opacity-50={index === goals.length - 1 || moving.has(goal.slug)}
						>
							[↓]
						</button>
					</div>
				</div>

				<!-- Progress Bar (ASSET_CONTAINER style) -->
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
						Remaining: {formatCurrency(goal.targetAmountInCents - goal.currentAllocation)}
					</span>
				</div>

				<!-- Target Date (if set) -->
				{#if goal.targetDate}
					<div class="text-xs text-gray-600 mt-1">
						Target: {formatDate(new Date(goal.targetDate))}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex gap-2 mt-2">
					<a href="/goals/{goal.slug}/add" class="bracket-link text-xs">[Add Money]</a>
					<a href="/goals/{goal.slug}/withdraw" class="bracket-link text-xs">[Withdraw]</a>
					<a href="/goals/{goal.slug}/confirm-archive" class="bracket-link text-xs text-red-700">[Archive]</a>
				</div>
			</div>
		{/each}
	{/if}

	<!-- Create Goal Button -->
	<div class="flex justify-between items-center mt-4">
		<a href="/goals/archived" class="bracket-link text-xs">[View Archived]</a>
		<a href="/goals/create" class="bracket-link text-xs">[+ Create New Goal]</a>
	</div>
</div>
