<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { getProgressColor } from '$lib/utils/formatting';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import GoalRow from '$lib/components/GoalRow.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import type { Goal } from '$lib/db/schema';

	let { data } = $props();

	// Pagination state with scroll target
	let tableSectionRef: HTMLElement | null = $state(null);
	let currentPage = $state(0);

	// Track if we're updating to prevent loops
	let isUpdatingPage = $state(false);

	// Sync from server data (initial + navigation)
	$effect(() => {
		if (isUpdatingPage) return;
		currentPage = data.goalsPagination.page;
	});

	// Sync from URL (1-indexed)
	$effect(() => {
		if (isUpdatingPage) return;
		const urlPage = Number(pageState.url.searchParams.get('page')) || 1;
		if (currentPage !== urlPage - 1) {
			currentPage = urlPage - 1;
		}
	});

	async function updatePage(newPage: number) {
		if (isUpdatingPage) return;
		isUpdatingPage = true;
		currentPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('page', String(newPage + 1));
		} else {
			url.searchParams.delete('page');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingPage = false;
	}

	// Calculate progress percentage for a goal
	function getProgress(goal: Goal): number {
		return goal.targetAmountInCents > 0
			? Math.min(100, Math.round((goal.currentAllocation / goal.targetAmountInCents) * 100))
			: 0;
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
	<span><span class="text-gray-600">●</span> ARCHIVED ({data.totalCount})</span>
	<a href="/goals" class="bracket-link text-xs">Back to Goals</a>
</div>

<div bind:this={tableSectionRef}>
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
		<PaginationClient page={currentPage} totalPages={data.goalsPagination.totalPages} onPageChange={updatePage} scrollTarget={tableSectionRef} />
	{/if}
	</div>
</div>
