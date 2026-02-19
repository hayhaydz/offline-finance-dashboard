<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import GoalCard from '$lib/components/GoalCard.svelte';
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
	<span><span class={data.staleness.cssClass}>●</span> GOALS ({data.goals.length})</span>
	<span class="text-xs text-gray-600">{data.staleness.label}</span>
</div>

<!-- Action Buttons -->
<div class="bg-gray-100 border-b border-black p-2 flex justify-end gap-2">
	<a href="/goals/archived" class="bracket-link text-xs">[View Archived]</a>
	<a href="/goals/create" class="bracket-link text-xs">[+ Create New Goal]</a>
</div>

<div class="border-b border-black p-2">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs mb-2">
			No goals yet. Create your first goal to start tracking.
		</p>
	{:else}
		{#each goals as goal, index}
			<div class="border border-black p-2 mb-2 last:mb-0">
				<!-- GoalCard with reorder buttons in header -->
				<GoalCard {goal} showArchive={true}>
					{#snippet headerActions()}
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
					{/snippet}
				</GoalCard>
			</div>
		{/each}
	{/if}
</div>
