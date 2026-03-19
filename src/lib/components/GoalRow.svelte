<script lang="ts">
	import { formatCurrencyShorthand, formatDate } from '$lib/utils/currency';
	import { getStaleness } from '$lib/utils/staleness';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import type { Goal } from '$lib/db/schema';

	type Milestone = { label: string; achieved: boolean };

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
	}

	let { goal, progress, progressColor, milestones, showActions = true, showArchivedDate = false, showStatus = false, isArchived = false, reorderMode = false, isSelected = false, isOtherSelected = false, onSelect, onPlaceHere }: Props = $props();

	const staleness = $derived(getStaleness(goal.updatedAt));
</script>

<tr class="goal-row border-b border-gray-200 last:border-b-0 {isArchived ? 'bg-gray-50' : ''} {isSelected ? 'bg-amber-50' : ''}">
	<td class="pl-2 text-sm py-2">
		<!-- Goal name -->
		<div class="font-bold {isArchived ? 'text-gray-600' : ''}">
			{#if reorderMode}
				<span class="text-gray-400 select-none mr-1">⋮⋮</span>
			{/if}
      <span class={staleness.cssClass}>●</span>
			{#if isArchived}
				<span>{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}</span>
				<span class="text-xs text-red-700 ml-1">[ARCHIVED]</span>
			{:else}
				<a href="/goals/{goal.slug}" class="bracket-link">{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}</a>
			{/if}
		</div>
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
		{#if goal.isEmergencyFund && milestones}
			<div class="text-xs font-normal mt-2">
				[
					{#each milestones as milestone, mIndex}
						{#if mIndex > 0}&nbsp;{/if}
						<span class="{milestone.achieved ? 'text-green-700' : 'text-gray-400'}">{milestone.label}</span>
					{/each}
				]
			</div>
		{/if}
	</td>
	<td class="text-right pr-4 text-sm py-2 whitespace-nowrap min-w-55">
		<div class="font-bold {isArchived ? 'text-gray-600' : progressColor.text}">
			{formatCurrencyShorthand(goal.currentAllocation)} / {formatCurrencyShorthand(goal.targetAmountInCents)}
		</div>
		<!-- Progress bar -->
		<div class="flex items-center gap-1 text-xs leading-none mt-1">
			<span>[</span>
			<div class="flex-1 h-3 relative border-y border-gray-100">
				<div
					class="h-full {isArchived ? 'bg-gray-400' : progressColor.bg}"
					style="width: {progress}%"
				></div>
			</div>
			<span>]</span>
			<span class="min-w-5 font-bold">{progress}%</span>
		</div>
	</td>
	<td class="text-right pr-1 text-sm py-2 whitespace-nowrap min-w-30">
		{#if goal.targetDate}
			<div class="text-xs text-gray-600">{formatDate(new Date(goal.targetDate))}</div>
		{:else}
			<span class="text-gray-400 text-xs">No deadline</span>
		{/if}
	</td>
	{#if showArchivedDate}
		<td class="text-right pr-1 text-sm py-2 whitespace-nowrap">
		{#if goal.deletedAt}
			<div class="text-xs text-gray-600">{formatDate(new Date(goal.deletedAt))}</div>
		{:else}
			<span class="text-gray-400 text-xs">-</span>
		{/if}
		</td>
	{/if}
</tr>
