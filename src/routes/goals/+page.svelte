<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { getProgressColor as getProgressColorFromPercent } from '$lib/utils/formatting';
	import { getStaleness } from '$lib/utils/staleness';
	import { formatCurrencyShorthand, formatDate } from '$lib/utils/currency';
	import GoalBulletBar from '$lib/components/charts/GoalBulletBar.svelte';
	import GoalRow from '$lib/components/GoalRow.svelte';
	import { listnav } from '$lib/utils/list-nav';
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import AlertsSection from '$lib/components/AlertsSection.svelte';
	import DebtStrategyPanel from '$lib/components/DebtStrategyPanel.svelte';
	import AllocationBar from '$lib/components/charts/AllocationBar.svelte';
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

	// Pagination with URL sync
	const pagination = useUrlPagination('page');

	// Sync from server data (initial + navigation)
	$effect(() => {
		pagination.page = data.page;
	});

	// Filter state: 'all', 'savings', or 'debt'
	let filter = $state<'all' | 'savings' | 'debt'>('all');
	let debtStrategy = $state<'snowball' | 'avalanche' | 'hybrid'>('snowball');

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

	// Reactive goals array for client-side reordering
	// Initialise from server data so the list SSR-renders (Phase 7: the
	// $effect below never runs server-side, leaving SSR with an empty
	// table); the effect keeps it in sync across navigations.
	// svelte-ignore state_referenced_locally
	let goals = $state<EnrichedGoal[]>([...data.goals]);
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
// Feedback for a failed move (revert is silent no more)
let reorderError = $state<string | null>(null);

// Shared move submission: error feedback on failure, invalidation on success
async function submitMove(slug: string, targetIndex: number) {
	const formData = new FormData();
	formData.append('slug', slug);
	formData.append('targetIndex', targetIndex.toString());

	const response = await fetch('/goals?/moveTo', { method: 'POST', body: formData });
	if (!response.ok) {
		goals = [...data.goals]; // revert on failure
		let errorText = 'Failed to move goal — try again.';
		try {
			const body = await response.json();
			if (body?.error) errorText = body.error;
		} catch {
			// non-JSON error body — keep the generic message
		}
		reorderError = errorText;
		return;
	}
	reorderError = null;
	await invalidateAll();
}

// Toggle reorder mode (clear selection on exit)
function toggleReorderMode() {
	reorderMode = !reorderMode;
	selectedSlug = null;
	reorderError = null;
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

	await submitMove(slug, originalTargetIdx);
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

	await submitMove(slug, others.length);
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
		if (goal.color && typeof goal.color === 'string') {
			// Debt goal with pre-calculated color
			if (goal.color === 'green') return { text: 'text-green-700', bg: 'bg-green-700' };
			if (goal.color === 'amber') return { text: 'text-amber-700', bg: 'bg-amber-600' };
			return { text: 'text-red-600', bg: 'bg-red-600' };
		}
		// Savings goal: delegate to shared utility
		return getProgressColorFromPercent(getProgress(goal));
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

	function getNextMilestone(goal: EnrichedGoal) {
		if (goal.goalType !== 'debt') return null;
		const milestones = (goal as any).milestones;
		if (!milestones || !Array.isArray(milestones)) return null;
		const unreached = milestones
			.filter((m: any) => !m.reachedAt)
			.sort((a: any, b: any) => a.thresholdInCents - b.thresholdInCents);
		if (unreached.length === 0) return null;
		const next = unreached[0];
		const progress = (goal as any).progress;
		const remaining = progress ? Math.max(0, progress.remainingInCents - (Math.abs(next.thresholdInCents))) : null;
		return {
			label: next.label,
			thresholdInCents: next.thresholdInCents,
			remainingInCents: remaining ?? 0,
		};
	}
</script>

<!-- NET WORTH SECTION -->
<div class="p-2"><!-- v3.1 border system: boxed hero in the inset frame -->
	<NetWorthDisplay
		summary={data.netWorthSummary}
		accounts={data.accounts}
	/>
</div>

<!-- v3.1 A04 design-quality: was a 3-col trio where ALLOCATION (263px)
     stretched READY TO ASSIGN (55% fill) and GOAL ALERTS (32% — D2
     violation). Now: one SHORT context row of three equal-volume cells
     (debt tracking promoted to its own cell — no more mixed domains),
     then the ranked allocation bars at full width (wider bars = roomier
     direct labels). -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-2 p-2"> <!-- v3.1 border system: cells own boxes, wrapper rule off -->
	<!-- READY TO ASSIGN -->
	<div class="border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>READY TO ASSIGN</span>
			<span class="text-gray-900">{formatCurrency(data.readyToAssign)}</span>
		</div>
		<div class="p-2 text-xs text-gray-600">
			<div class="mb-1 tabular-nums">
				{formatCurrency(data.liquidAssets)} instant-access cash &minus; {formatCurrency(data.totalSavingsAllocated)} already allocated to savings
			</div>
			{#if data.totalUnallocatedAssets !== data.readyToAssign}
				<div class="text-[10px] text-gray-500">
					+ {formatCurrency(data.totalUnallocatedAssets - data.readyToAssign)} unallocated in delayed/locked accounts (bonds, investments)
				</div>
			{/if}
		</div>
	</div>

	<!-- DEBT TRACKING (own cell — was a sub-block inside RTA) -->
	{#if data.totalLiabilities > 0}
	<div class="border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>DEBT TRACKING</span>
			<span class="text-gray-900">{formatCurrency(data.totalLiabilities)}</span>
		</div>
		<div class="p-2 text-xs text-gray-600">
			<div class="flex justify-between">
				<span>Tracked by goals</span>
				<span>{formatCurrency(data.totalDebtTracked)}</span>
			</div>
			<div class="flex justify-between">
				<span>Untracked liabilities</span>
				<span class="{data.totalDebtUntracked > 0 ? 'text-amber-700 font-bold' : ''}">{formatCurrency(data.totalDebtUntracked)}</span>
			</div>
		</div>
	</div>
	{/if}

	{#if data.alerts.length > 0}
		<div class="border border-black [&>*:last-child]:border-b-0">
			<AlertsSection alerts={data.alerts} title="GOAL ALERTS" viewAllHref="/alerts" />
		</div>
	{/if}
</div>

{#if goals.length > 0}
<!-- v3.1 border system: ChartPanel self-borders — no outer box -->
<div class="p-2">
	<AllocationBar
		items={goals.map((g) => ({ name: g.name, value: Math.max(0, g.currentAllocation ?? 0) }))}
		label="allocated"
	/>
</div>
{/if}

<!-- DEBT STRATEGY PANEL (shown when filtering by debt and strategy data exists) -->
{#if filter === 'debt' && data.debtStrategyMetrics}
	<DebtStrategyPanel
		metrics={data.debtStrategyMetrics}
		selectedStrategy={debtStrategy}
		onStrategyChange={(s) => debtStrategy = s}
	/>
{/if}

<!-- GOALS LIST SECTION -->
<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
	<div class="flex items-center gap-2">
		{#if staleness}
			<span class="text-xs text-gray-600">{staleness.label}</span>
		{/if}
		<div class="flex gap-1">
			<button
				type="button"
				onclick={() => setFilter('all')}
				class="bracket-link text-xs font-bold"
				class:text-green-800={filter === 'all'}
			>
				All
			</button>
			<button
				type="button"
				onclick={() => setFilter('savings')}
				class="bracket-link text-xs font-bold"
				class:text-green-800={filter === 'savings'}
			>
				Savings
			</button>
			<button
				type="button"
				onclick={() => setFilter('debt')}
				class="bracket-link text-xs font-bold"
				class:text-green-800={filter === 'debt'}
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
	{#if reorderMode && reorderError}
		<div class="bg-red-100 border-b border-black p-2 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {reorderError}
		</div>
	{/if}
	{#if data.goals.length === 0}
		<p class="text-gray-600 text-xs p-2">
			{#if filter === 'debt'}
				No debt goals yet. <a href="/goals/debt/create" class="bracket-link">Track your first debt</a> to see payoff projections.
			{:else}
				No goals yet. Create your first goal to start tracking.
			{/if}
		</p>
	{:else}
		<!-- v3.1 third-mandate: the goals LIST is a CARD GRID (3-wide at
		     desktop) — the old 3-column table never used the viewport and
		     read as a boring vertical ledger. Reorder, meters, milestones
		     and debt context all preserved on the cards. -->
		<div class="p-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2" bind:this={tableRef} use:listnav>
			{#each goals as goal, index}
				{@const progress = getProgress(goal)}
				{@const progressColor = getProgressColor(goal)}
				{@const isDebtGoal = goal.goalType === 'debt'}
				{@const milestones = isDebtGoal
					? ((goal as any).milestones ?? []).map((m: any) => ({
							label: m.label as string,
							thresholdInCents: m.thresholdInCents as number,
							reachedAt: m.reachedAt ?? null
						}))
					: getEmergencyFundMilestones(goal)}
				{@const paidInCents = 'progress' in goal && typeof goal.progress === 'object' && 'paidInCents' in goal.progress ? goal.progress.paidInCents : undefined}
				{@const remainingInCents = 'progress' in goal && typeof goal.progress === 'object' && 'remainingInCents' in goal.progress ? goal.progress.remainingInCents : undefined}
				{@const stalenessDot = getStaleness(goal.updatedAt)}
				{@const savingsOver = !isDebtGoal && goal.currentAllocation > goal.targetAmountInCents ? goal.currentAllocation - goal.targetAmountInCents : null}
				{@const nextMs = getNextMilestone(goal)}
				<div
					class="border border-black p-2 flex flex-col gap-1 hover:bg-gray-50 transition-colors duration-150 {selectedSlug === goal.slug ? 'bg-amber-50' : ''}"
					data-nav-row
				>
					<div class="flex items-center gap-1 font-bold text-sm min-w-0">
						<span class={stalenessDot ? stalenessDot.cssClass : 'text-gray-500'}>●</span>
						{#if reorderMode}
							<span class="text-gray-500 select-none mr-0.5">⋮⋮</span>
						{/if}
						<a href="/goals/{goal.slug}" class="bracket-link truncate" data-nav-primary>{goal.name}</a>
						{#if isDebtGoal}
							<span class="text-[9px] font-bold text-gray-500 border border-gray-300 px-0.5 shrink-0">DEBT</span>
						{/if}
					</div>

					<!-- meter + headline numbers -->
					<div class="flex items-center gap-1 text-xs leading-none">
						<span class="sr-only">{isDebtGoal && paidInCents !== undefined ? `£${paidInCents} of £${(paidInCents ?? 0) + (remainingInCents ?? 0)} paid off` : `£${goal.currentAllocation} of £${goal.targetAmountInCents}`}</span>
						<GoalBulletBar percent={isDebtGoal && paidInCents !== undefined && remainingInCents !== undefined ? Math.max(0, Math.round((Math.max(0, paidInCents) / (Math.max(0, paidInCents) + remainingInCents)) * 100)) : progress} bgClass={progressColor.bg} />
						{#if savingsOver !== null}
							<span class="font-bold text-green-700 whitespace-nowrap">REACHED +{formatCurrencyShorthand(savingsOver)}</span>
						{:else}
							<span class="min-w-8 font-bold text-right whitespace-nowrap">{progress}%</span>
						{/if}
					</div>
					<div class="text-sm font-bold tabular-nums {progressColor.text} flex justify-between">
						<span>{isDebtGoal && paidInCents !== undefined ? `${formatCurrencyShorthand(paidInCents)} paid` : formatCurrencyShorthand(goal.currentAllocation)}</span>
						<span class="text-gray-500 font-normal">
							{#if isDebtGoal && remainingInCents !== undefined}
								{formatCurrencyShorthand(remainingInCents)} left
							{:else}
								of {formatCurrencyShorthand(goal.targetAmountInCents)}
							{/if}
						</span>
					</div>

					<!-- context lines -->
					<div class="text-[10px] text-gray-600 mt-auto flex flex-col gap-0.5">
						{#if isDebtGoal && goal.linkedAccount?.name}
							<div class="truncate">→ {goal.linkedAccount.name}</div>
						{/if}
						{#if nextMs}
							<div class="truncate">next: {nextMs.label} ({formatCurrencyShorthand(nextMs.remainingInCents)} more)</div>
						{/if}
						<div class="flex justify-between gap-2">
							<span>{goal.targetDate ? `by ${formatDate(new Date(goal.targetDate))}` : 'no deadline'}</span>
							<span class="text-gray-600">{formatDate(new Date(goal.updatedAt))}</span>
						</div>
					</div>

					<!-- reorder controls -->
					{#if reorderMode}
						<div class="border-t border-gray-200 pt-1">
							{#if selectedSlug === goal.slug}
								<span class="text-xs text-amber-700 font-bold">MOVING —</span>
								<button type="button" onclick={() => selectGoal(goal.slug)} class="bracket-link text-xs ml-1">Cancel</button>
							{:else if selectedSlug !== null}
								<button type="button" onclick={() => placeAt(goal.slug)} class="bracket-link text-xs text-amber-700">Move Here</button>
							{:else}
								<button type="button" onclick={() => selectGoal(goal.slug)} class="bracket-link text-xs">Select</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if reorderMode && selectedSlug !== null}
			<div class="border-t border-gray-300 p-2">
				<button type="button" onclick={placeAtEnd} class="bracket-link text-xs text-amber-700">
					Move to End
				</button>
			</div>
		{/if}
	{/if}
	<PaginationClient
		page={pagination.page}
		totalPages={data.totalPages}
		onPageChange={pagination.updatePage}
		scrollTarget={tableRef}
	/>
</div>