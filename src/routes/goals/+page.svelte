<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { formatCurrency } from '$lib/utils/currency';
	import { getStaleness } from '$lib/utils/staleness';
	import GoalRow from '$lib/components/GoalRow.svelte';
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import type { Goal } from '$lib/db/schema';

	let { data } = $props();

	// Type for enriched goal data from server (includes debt goal fields)
	type EnrichedGoal = Goal & {
		progress?: { percent: number; paidInCents: number; remainingInCents: number; totalInCents: number };
		color?: string;
		currentBalance?: number;
		linkedAccount?: { name: string } | null;
	};

	let tableRef: HTMLElement | null = $state(null);
	let currentPage = $state(0);
	let isUpdatingPage = $state(false);

	// Filter state: 'all', 'savings', or 'debt'
	let filter = $state<'all' | 'savings' | 'debt'>('all');

	// Sync filter from URL query param
	$effect(() => {
		const urlFilter = pageState.url.searchParams.get('type') as 'all' | 'savings' | 'debt' | null;
		if (urlFilter === 'savings' || urlFilter === 'debt' || urlFilter === 'all') {
			filter = urlFilter;
		} else {
			filter = 'all';
		}
	});

	async function setFilter(newFilter: 'all' | 'savings' | 'debt') {
		filter = newFilter;
		const url = new URL(pageState.url);
		if (newFilter === 'all') {
			url.searchParams.delete('type');
		} else {
			url.searchParams.set('type', newFilter);
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
	}

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

	$effect(() => {
		if (isUpdatingPage) return;
		currentPage = data.page;
	});

	$effect(() => {
		if (isUpdatingPage) return;
		const urlPage = Number(pageState.url.searchParams.get('page')) || 1;
		if (currentPage !== urlPage - 1) {
			currentPage = urlPage - 1;
		}
	});

	// Reactive goals array for client-side reordering
	let goals = $state<EnrichedGoal[]>([]);
	let selectedSlug = $state<string | null>(null);

	// Sync goals with server data
	$effect(() => {
		goals = [...data.goals];
	});

	const lastUpdated = $derived(
		goals.length > 0
			? goals.reduce((latest, g) => (g.updatedAt > latest ? g.updatedAt : latest), goals[0].updatedAt)
			: null
	);

	const staleness = $derived(lastUpdated ? getStaleness(lastUpdated) : null);

	// Reorder mode state
	let reorderMode = $state(false);

	// Toggle reorder mode (clear selection on exit)
	function toggleReorderMode() {
		reorderMode = !reorderMode;
		selectedSlug = null;
	}

	// Select a goal to move (toggle deselect)
	function selectGoal(slug: string) {
		selectedSlug = selectedSlug === slug ? null : slug;
	}

	// Place selected goal before the target goal's current position
	async function placeAt(targetSlug: string) {
		const slug = selectedSlug;
		if (!slug || slug === targetSlug) return;

		const selected = goals.find(g => g.slug === slug);
		if (!selected) return;

		// Use original index so the selected item lands exactly at the clicked row's position
		const originalTargetIdx = goals.findIndex(g => g.slug === targetSlug);

		const others = goals.filter(g => g.slug !== slug);
		const clampedIdx = Math.min(originalTargetIdx, others.length);
		others.splice(clampedIdx, 0, selected);
		goals = others;
		selectedSlug = null;

		const formData = new FormData();
		formData.append('slug', slug);
		formData.append('targetIndex', originalTargetIdx.toString());

		const response = await fetch('/goals?/moveTo', { method: 'POST', body: formData });
		if (!response.ok) {
			goals = [...data.goals]; // revert on failure
		}
	}

	// Place selected goal at the end
	async function placeAtEnd() {
		const slug = selectedSlug;
		if (!slug) return;

		const selected = goals.find(g => g.slug === slug);
		if (!selected) return;

		const others = goals.filter(g => g.slug !== slug);
		others.push(selected);
		goals = others;
		selectedSlug = null;

		const formData = new FormData();
		formData.append('slug', slug);
		formData.append('targetIndex', others.length.toString());

		const response = await fetch('/goals?/moveTo', { method: 'POST', body: formData });
		if (!response.ok) {
			goals = [...data.goals];
		}
	}

	// Calculate progress percentage for a goal
	function getProgress(goal: EnrichedGoal): number {
		if (goal.progress && typeof goal.progress === 'object' && 'percent' in goal.progress) {
			// Debt goal with pre-calculated progress
			return Math.round(goal.progress.percent);
		}
		// Savings goal
		return goal.targetAmountInCents > 0
			? Math.min(100, Math.round((goal.currentAllocation / goal.targetAmountInCents) * 100))
			: 0;
	}

	// Get progress color class based on percentage
	function getProgressColor(goal: EnrichedGoal): { text: string; bg: string } {
		const progress = getProgress(goal);
		if (goal.color && typeof goal.color === 'string') {
			// Debt goal with pre-calculated color
			if (goal.color === 'green') return { text: 'text-green-700', bg: 'bg-green-700' };
			if (goal.color === 'amber') return { text: 'text-amber-600', bg: 'bg-amber-600' };
			return { text: 'text-red-600', bg: 'bg-red-600' };
		}
		// Savings goal: calculate from progress percentage
		if (progress >= 70) return { text: 'text-green-700', bg: 'bg-green-700' };
		if (progress >= 30) return { text: 'text-amber-600', bg: 'bg-amber-600' };
		return { text: 'text-red-600', bg: 'bg-red-600' };
	}

	// Get emergency fund milestones display
	function getEmergencyFundMilestones(goal: EnrichedGoal) {
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

<!-- NET WORTH SECTION -->
<NetWorthDisplay
	summary={data.netWorthSummary}
	accounts={data.accounts}
/>

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
<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
	<div class="flex items-center gap-2">
		{#if staleness}
			<span class="text-xs text-gray-500">{staleness.label}</span>
		{/if}
		<div class="flex gap-1">
			<button
				type="button"
				onclick={() => setFilter('all')}
				class="bracket-link text-xs font-bold"
				class:text-green-700={filter === 'all'}
			>
				All
			</button>
			<button
				type="button"
				onclick={() => setFilter('savings')}
				class="bracket-link text-xs font-bold"
				class:text-green-700={filter === 'savings'}
			>
				Savings
			</button>
			<button
				type="button"
				onclick={() => setFilter('debt')}
				class="bracket-link text-xs font-bold"
				class:text-green-700={filter === 'debt'}
			>
				Debt
			</button>
		</div>
	</div>
	<div class="flex gap-2">
		<button
			type="button"
			onclick={toggleReorderMode}
			class="bracket-link text-xs"
		>
			{reorderMode ? 'Done' : 'Re-order'}
		</button>
		<a href="/goals/archived" class="bracket-link text-xs">View Archived</a>
		<a href="/goals/create" class="bracket-link text-xs">+ Create New Goal</a>
	</div>
</div>

<div class="p-0">
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs p-2">
			No goals yet. Create your first goal to start tracking.
		</p>
	{:else}
		<div class="overflow-x-auto" bind:this={tableRef}>
		<table class="w-full">
			<thead>
				<tr>
					<th class="pl-2 text-left whitespace-nowrap">Goal</th>
					<th class="text-right pr-4 whitespace-nowrap min-w-55">Progress</th>
					<th class="text-right pr-1 whitespace-nowrap min-w-30">
						{data.goals.find(g => g.goalType === 'debt') ? 'Starting/Deadline' : 'Target'}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each goals as goal, index}
					{@const progress = getProgress(goal)}
					{@const progressColor = getProgressColor(goal)}
					{@const milestones = getEmergencyFundMilestones(goal)}
					{@const isDebtGoal = goal.goalType === 'debt'}
					<GoalRow
						{goal}
						{progress}
						{progressColor}
						{milestones}
						{isDebtGoal}
						startingBalanceInCents={goal.startingBalanceInCents}
						currentBalanceInCents={'currentBalance' in goal ? goal.currentBalance : undefined}
						linkedAccountName={goal.linkedAccount?.name ?? null}
						paidInCents={'progress' in goal && typeof goal.progress === 'object' && 'paidInCents' in goal.progress ? goal.progress.paidInCents : undefined}
						remainingInCents={'progress' in goal && typeof goal.progress === 'object' && 'remainingInCents' in goal.progress ? goal.progress.remainingInCents : undefined}
						reorderMode={reorderMode}
						isSelected={selectedSlug === goal.slug}
						isOtherSelected={selectedSlug !== null && selectedSlug !== goal.slug}
						onSelect={() => selectGoal(goal.slug)}
						onPlaceHere={() => placeAt(goal.slug)}
					/>
				{/each}
			</tbody>
		</table>
		</div>
		{#if reorderMode && selectedSlug !== null}
			<div class="border-t border-gray-300 p-2">
				<button type="button" onclick={placeAtEnd} class="bracket-link text-xs text-amber-700">
					[Move to End]
				</button>
			</div>
		{/if}
	{/if}
	<PaginationClient
		page={currentPage}
		totalPages={data.totalPages}
		onPageChange={updatePage}
		scrollTarget={tableRef}
	/>
</div>
