<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { getStaleness } from '$lib/utils/staleness';
	import GoalRow from '$lib/components/GoalRow.svelte';
	import type { Goal } from '$lib/db/schema';

	let { data } = $props();

	// Reactive goals array for client-side reordering
	let goals = $state<Goal[]>([]);
	let moving = $state<Set<string>>(new Set());

	// Sync goals with server data
	$effect(() => {
		goals = [...data.goals];
	});

	// Reorder mode state
	let reorderMode = $state(false);
	let archiveMode = $state(false);

	// Toggle reorder mode
	function toggleReorderMode() {
		reorderMode = !reorderMode;
		// Disable archive mode when enabling reorder mode
		if (reorderMode) archiveMode = false;
	}

	// Toggle archive mode
	function toggleArchiveMode() {
		archiveMode = !archiveMode;
		// Disable reorder mode when enabling archive mode
		if (archiveMode) reorderMode = false;
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

	// Get staleness info for a goal
	function getGoalStaleness(goal: Goal) {
		return getStaleness(new Date(goal.updatedAt));
	}
</script>

<!-- READY TO ASSIGN SECTION -->
<div class="border-b border-black bg-gray-50 p-2">
	<div class="flex justify-between items-center mb-1">
		<span class="text-xs tracking-widest font-bold">READY TO ASSIGN</span>
		<span class="text-xs font-bold text-gray-900">{formatCurrency(data.readyToAssign)}</span>
	</div>
	<div class="text-sm text-gray-800">
		{formatCurrency(data.totalAssets)} assets - {formatCurrency(data.totalAllocated)} allocated
	</div>
</div>

<!-- GOALS LIST SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>GOALS ({data.goals.length})</span>
	<div class="flex gap-2">
		<button
			type="button"
			onclick={toggleReorderMode}
			class="bracket-link text-xs"
		>
			[{reorderMode ? 'Done' : 'Re-order'}]
		</button>
		<button
			type="button"
			onclick={toggleArchiveMode}
			class="bracket-link text-xs"
		>
			[{archiveMode ? 'Done' : 'Archive'}]
		</button>
		<a href="/goals/archived" class="bracket-link text-xs">[View Archived]</a>
		<a href="/goals/create" class="bracket-link text-xs">[+ Create New Goal]</a>
	</div>
</div>

<div class="p-0">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs p-2">
			No goals yet. Create your first goal to start tracking.
		</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="pl-2 text-left">Goal</th>
					<th class="text-right pr-1">Progress</th>
					<th class="text-right pr-1">Target</th>
					<th class="text-right pr-1">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each goals as goal, index}
					{@const progress = getProgress(goal)}
					{@const progressColor = getProgressColor(progress)}
					{@const milestones = getEmergencyFundMilestones(goal)}
					{@const staleness = getGoalStaleness(goal)}
					<GoalRow
						{goal}
						{progress}
						{progressColor}
						{milestones}
						{staleness}
						archiveMode={archiveMode}
						reorderMode={reorderMode}
						canMoveUp={index > 0 && !moving.has(goal.slug)}
						canMoveDown={index < goals.length - 1 && !moving.has(goal.slug)}
						onMoveUp={() => moveGoal(goal.slug, 'up', index)}
						onMoveDown={() => moveGoal(goal.slug, 'down', index)}
						isMoving={moving.has(goal.slug)}
					/>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
