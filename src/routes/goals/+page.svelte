<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import { formatCurrency, formatDate } from '$lib/utils/currency';
	import type { Goal } from '$lib/db/schema';

	let { data, form } = $props<{
		data: { goals: Goal[]; user: { id: number; username: string; createdAt: Date } };
		form: any;
	}>();

	// Modal states
	let deleteGoalSlug = $state<string | null>(null);
	let deleteGoalName = $state<string>('');

	// Find goal being deleted (for confirmation modal)
	const deletingGoal = $derived(
		deleteGoalSlug ? data.goals.find((g: Goal) => g.slug === deleteGoalSlug) || null : null
	);

	// Format goal type for display
	function formatGoalType(type: string): string {
		const labels: Record<string, string> = {
			'emergency-fund': 'Emergency Fund',
			'house-deposit': 'House Deposit',
			'car': 'Car',
			'holiday': 'Holiday',
			'wedding': 'Wedding',
			'other': 'Other'
		};
		return labels[type] || type;
	}

	// Open delete confirmation
	function openDeleteConfirm(goal: Goal) {
		deleteGoalSlug = goal.slug;
		deleteGoalName = goal.name;
	}

	// Close delete confirmation
	function closeDeleteConfirm() {
		deleteGoalSlug = null;
		deleteGoalName = '';
	}

	// Handle delete success
	async function handleDeleteSuccess() {
		closeDeleteConfirm();
		await invalidateAll();
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">GOALS</h1>
	<p class="text-gray-600 my-1">Track your savings goals and targets</p>
</div>

<!-- GOALS LIST SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>GOALS ({data.goals.length})</span>
		<a href="/goals/create" class="bracket-link text-xs">
			[Create Goal]
		</a>
	</div>

<div class="border-b border-black p-2">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs mb-2">No goals yet. Create your first goal to start tracking.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="text-left pl-1">Name</th>
					<th class="text-left pl-1">Type</th>
					<th class="text-right pl-1">Target</th>
					<th class="text-right pr-1">Target Date</th>
					<th class="text-right pr-1">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.goals as goal}
					<tr>
						<td class="pl-1">
							<a
								href="/goals/edit/{goal.slug}"
								class="bracket-link text-left text-sm p-0"
							>
								[{goal.name}]
							</a>
						</td>
						<td class="pl-1 text-xs">{formatGoalType(goal.goalType)}</td>
						<td class="text-right pl-1 text-sm">
							{formatCurrency(goal.targetAmountInCents)}
						</td>
						<td class="text-right pr-1 text-sm">
							{goal.targetDate ? formatDate(new Date(goal.targetDate)) : '-'}
						</td>
						<td class="text-right pr-1">
							<div class="flex gap-2 justify-end">
								<a
									href="/goals/edit/{goal.slug}"
									class="bracket-link text-xs"
								>
									[Edit]
								</a>
								<button
									type="button"
									onclick={() => openDeleteConfirm(goal)}
									class="bracket-link text-xs text-red-700"
								>
									[Delete]
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<!-- DELETE CONFIRMATION MODAL -->
{#if deleteGoalSlug}
	<ConfirmationModal
		title="Delete Goal"
		message="Are you sure you want to delete &quot;{deleteGoalName}&quot;? This action cannot be undone."
		confirmText="Delete"
		cancelText="Cancel"
		onConfirm={async () => {
			if (!deleteGoalSlug) return;
			const formData = new FormData();
			formData.append('slug', deleteGoalSlug);
			await fetch('?/delete', {
				method: 'POST',
				body: formData
			});
			handleDeleteSuccess();
		}}
		onCancel={closeDeleteConfirm}
	/>
{/if}
