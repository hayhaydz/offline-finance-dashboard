<script lang="ts">
	import { formatCurrencyShorthand, formatDate } from '$lib/utils/currency';
	import { getStaleness } from '$lib/utils/staleness';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import GoalBulletBar from '$lib/components/charts/GoalBulletBar.svelte';
	import { debtTicks, emergencyFundTicks, type GoalTick } from '$lib/utils/goal-milestone-ticks';
	import type { Goal } from '$lib/db/schema';

	/** Legacy emergency-fund labels OR debt DB rows (threshold + reachedAt). */
	type Milestone = {
		label: string;
		achieved?: boolean;
		thresholdInCents?: number | null;
		reachedAt?: Date | string | null;
	};

	interface Props {
		goal: Goal;
		progress: number;
		progressColor: { text: string; bg: string };
		milestones: Milestone[] | null;
		showActions?: boolean;
		showArchivedDate?: boolean;
		showStatus?: boolean;
		isArchived?: boolean;
		// Inline reorder props
		reorderMode?: boolean;
		isSelected?: boolean;
		isOtherSelected?: boolean;
		onSelect?: () => void;
		onPlaceHere?: () => void;
		// Debt goal specific props
		isDebtGoal?: boolean;
		startingBalanceInCents?: number | null;
		currentBalanceInCents?: number;
		linkedAccountName?: string | null;
		paidInCents?: number;
		remainingInCents?: number;
		nextMilestone?: { label: string; thresholdInCents: number; remainingInCents: number } | null;
	}

	let { goal, progress, progressColor, milestones, showActions = true, showArchivedDate = false, showStatus = false, isArchived = false, reorderMode = false, isSelected = false, isOtherSelected = false, onSelect, onPlaceHere, isDebtGoal = false, startingBalanceInCents, currentBalanceInCents, linkedAccountName, paidInCents, remainingInCents, nextMilestone }: Props = $props();

	const staleness = $derived(getStaleness(goal.updatedAt));

	// Over-target amount for savings goals (allocation past the target — intended)
	const savingsOver = $derived(!isDebtGoal && goal.currentAllocation > goal.targetAmountInCents
		? goal.currentAllocation - goal.targetAmountInCents
		: null
	);

	// Debt-specific progress calculation
	const debtProgress = $derived(isDebtGoal && paidInCents !== undefined && remainingInCents !== undefined
		? Math.max(0, Math.round((Math.max(0, paidInCents) / (Math.max(0, paidInCents) + remainingInCents)) * 100))
		: null
	);

	// Normalised label list (label row under the name keeps working for
	// both the derived emergency-fund shape and debt DB rows)
	const milestoneLabels = $derived(
		(milestones ?? []).map((m) => ({
			label: m.label,
			achieved: m.achieved ?? m.reachedAt != null,
		})),
	);

	// Phase 4 V1 #3: bullet-bar tick positions
	const ticks = $derived.by(() => {
		if (goal.isEmergencyFund) {
			return emergencyFundTicks(goal.targetAmountInCents, goal.currentAllocation);
		}
		if (
			isDebtGoal &&
			startingBalanceInCents !== null &&
			startingBalanceInCents !== undefined &&
			currentBalanceInCents !== undefined &&
			(milestones ?? []).some((m) => m.thresholdInCents !== undefined)
		) {
			return debtTicks(
				startingBalanceInCents,
				currentBalanceInCents,
				(milestones ?? [])
					.filter((m) => m.thresholdInCents !== undefined)
					.map((m) => ({
						label: m.label,
						thresholdInCents: m.thresholdInCents ?? 0,
						reachedAt: m.reachedAt ?? null,
					})),
			);
		}
		return [] as GoalTick[];
	});
</script>

<tr class="goal-row border-b border-gray-200 last:border-b-0 {isArchived ? 'bg-gray-50' : ''} {isSelected ? 'bg-amber-50' : ''}" data-nav-row>
	<td class="pl-2 text-sm py-2">
		<!-- Goal name -->
		<div class="font-bold {isArchived ? 'text-gray-600' : ''}">
			{#if reorderMode}
				<span class="text-gray-500 select-none mr-1">⋮⋮</span>
			{/if}
			{#if staleness}
					<span class={staleness.cssClass}>●</span>
				{:else}
					<span class="text-gray-500">●</span>
				{/if}
			{#if isArchived}
				<span>{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}</span>
				<span class="text-xs text-red-700 ml-1">[ARCHIVED]</span>
			{:else}
				<a href="/goals/{goal.slug}" class="bracket-link">{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}</a>
			{/if}
		</div>
		<!-- Linked account for debt goals -->
		{#if isDebtGoal && linkedAccountName}
			<div class="text-xs text-gray-600 mt-1">{linkedAccountName}</div>
		{/if}
		{#if nextMilestone}
			<div class="text-xs text-gray-500 mt-1">
				next: {nextMilestone.label} ({formatCurrencyShorthand(nextMilestone.remainingInCents)} more)
			</div>
		{/if}
		<!-- Reorder controls inline under name -->
		{#if reorderMode && !isArchived}
			<div class="mt-1">
				{#if isSelected}
					<span class="text-xs text-amber-700 font-bold">MOVING —</span>
					<button type="button" onclick={onSelect} class="bracket-link text-xs ml-1">Cancel</button>
				{:else if isOtherSelected}
					<button type="button" onclick={onPlaceHere} class="bracket-link text-xs text-amber-700">Move Here</button>
				{:else}
					<button type="button" onclick={onSelect} class="bracket-link text-xs">Select</button>
				{/if}
			</div>
		{/if}
		<!-- Emergency fund milestones below name -->
		{#if goal.isEmergencyFund && milestoneLabels.length > 0}
			<div class="text-xs font-normal mt-2">
				[
					{#each milestoneLabels as milestone, mIndex}
						{#if mIndex > 0}&nbsp;{/if}
						<span class="{milestone.achieved ? 'text-green-700' : 'text-gray-500'}">{milestone.label}</span>
					{/each}
				]
			</div>
		{/if}
	</td>
	<td class="text-right pr-4 text-sm py-2 whitespace-nowrap min-w-55">
		{#if isDebtGoal}
			<!-- Debt goal: show paid/remaining -->
			<div class="font-bold {isArchived ? 'text-gray-600' : progressColor.text}">
				{#if paidInCents !== undefined && remainingInCents !== undefined}
					{formatCurrencyShorthand(paidInCents)} / {formatCurrencyShorthand(remainingInCents)}
				{:else}
					{formatCurrencyShorthand(goal.currentAllocation)} / {formatCurrencyShorthand(goal.targetAmountInCents)}
				{/if}
			</div>
		<!-- Progress bar (Phase 4 V1 #3: bullet bar with milestone ticks) -->
		<div class="flex items-center gap-1 text-xs leading-none mt-1">
			<GoalBulletBar percent={debtProgress ?? progress} bgClass={progressColor.bg} {ticks} archived={isArchived} />
			{#if savingsOver !== null}
				<span class="font-bold text-green-700 whitespace-nowrap">REACHED — {formatCurrencyShorthand(savingsOver)} over target</span>
			{:else}
				<span class="min-w-5 font-bold">{progress}%</span>
			{/if}
		</div>
	{:else}
			<!-- Savings goal: show current/target -->
			<div class="font-bold {isArchived ? 'text-gray-600' : progressColor.text}">
				{formatCurrencyShorthand(goal.currentAllocation)} / {formatCurrencyShorthand(goal.targetAmountInCents)}
			</div>
			<!-- Progress bar (Phase 4 V1 #3: bullet bar with milestone ticks) -->
			<div class="flex items-center gap-1 text-xs leading-none mt-1">
				<GoalBulletBar percent={progress} bgClass={progressColor.bg} {ticks} archived={isArchived} />
				<span class="min-w-5 font-bold">{progress}%</span>
			</div>
		{/if}
	</td>
	<td class="text-right pr-1 text-sm py-2 whitespace-nowrap min-w-30">
		{#if goal.targetDate}
			<div class="text-xs text-gray-600">{formatDate(new Date(goal.targetDate))}</div>
		{:else}
			<span class="text-gray-500 text-xs">No deadline</span>
		{/if}
	</td>
	{#if showArchivedDate}
		<td class="text-right pr-1 text-sm py-2 whitespace-nowrap">
		{#if goal.deletedAt}
			<div class="text-xs text-gray-600">{formatDate(new Date(goal.deletedAt))}</div>
		{:else}
			<span class="text-gray-500 text-xs">-</span>
		{/if}
		</td>
	{/if}
</tr>
