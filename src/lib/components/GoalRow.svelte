<script lang="ts">
	import { formatCurrencyShorthand, formatDate } from '$lib/utils/currency';
	import type { Goal } from '$lib/db/schema';

	type Milestone = { label: string; achieved: boolean };

	type StalenessInfo = {
		color: 'green' | 'amber' | 'red';
		label: string;
		cssClass: string;
	};

	interface Props {
		goal: Goal;
		progress: number;
		progressColor: { text: string; bg: string };
		milestones: Milestone[] | null;
		staleness?: StalenessInfo;
		showActions?: boolean;
		showArchivedDate?: boolean;
		showStatus?: boolean;
		isArchived?: boolean;
		// Inline reorder props
		reorderMode?: boolean;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
		isMoving?: boolean;
		// Archive mode prop
		archiveMode?: boolean;
	}

	let { goal, progress, progressColor, milestones, staleness, showActions = true, showArchivedDate = false, showStatus = false, isArchived = false, reorderMode = false, canMoveUp = true, canMoveDown = true, onMoveUp, onMoveDown, isMoving = false, archiveMode = false }: Props = $props();
</script>

<tr class="border-b border-gray-200 last:border-b-0 {isArchived ? 'bg-gray-50' : ''}">
	<td class="pl-2 text-sm py-2">
		<!-- Goal name -->
		<div class="font-bold {isArchived ? 'text-gray-600' : ''} {reorderMode && !isMoving ? 'flex items-center gap-2' : ''}">
			{#if reorderMode}
				<span class="text-gray-400 select-none">⋮⋮</span>
			{/if}
      {#if staleness}
				<span class={staleness.cssClass}>●</span>
			{/if}
			<span>{goal.name}</span>
			{#if isArchived}
				<span class="text-xs text-red-700 ml-1">[ARCHIVED]</span>
			{/if}
		</div>
		<!-- Emergency fund milestones below name -->
		{#if goal.isEmergencyFund && milestones}
			<div class="text-[10px] font-normal mt-2">
				[
					{#each milestones as milestone, mIndex}
						{#if mIndex > 0}&nbsp;{/if}
						<span class="{milestone.achieved ? 'text-green-700' : 'text-gray-400'}">{milestone.label}</span>
					{/each}
				]
			</div>
		{/if}
	</td>
	<td class="text-right pr-1 text-sm py-2">
		<!-- Progress amount -->
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
			<span class="min-w-[20px] font-bold">{progress}%</span>
		</div>
	</td>
	<td class="text-right pr-1 text-sm py-2">
		{#if goal.targetDate}
			<div class="text-xs text-gray-600">{formatDate(new Date(goal.targetDate))}</div>
		{:else}
			<span class="text-gray-400 text-xs">No deadline</span>
		{/if}
	</td>
	{#if showArchivedDate}
		<td class="text-right pr-1 text-sm py-2">
		{#if goal.deletedAt}
			<div class="text-xs text-gray-600">{formatDate(new Date(goal.deletedAt))}</div>
		{:else}
			<span class="text-gray-400 text-xs">-</span>
		{/if}
		</td>
	{/if}
	{#if showActions}
	<td class="text-right pr-1 text-sm py-2">
		{#if reorderMode}
			<div class="flex justify-end gap-1 {isMoving ? 'opacity-50' : ''}">
				<span class="text-gray-400 text-xs select-none">⋮⋮</span>
				<button
					type="button"
					onclick={onMoveUp}
					class="bracket-link text-xs"
					disabled={!canMoveUp || isMoving}
					class:opacity-50={!canMoveUp || isMoving}
				>
					↑
				</button>
				<button
					type="button"
					onclick={onMoveDown}
					class="bracket-link text-xs"
					disabled={!canMoveDown || isMoving}
					class:opacity-50={!canMoveDown || isMoving}
				>
					↓
				</button>
			</div>
		{:else if archiveMode && !isArchived}
			<div class="flex justify-end gap-1">
				<a href="/goals/{goal.slug}/confirm-archive" class="bracket-link text-xs text-red-700">[Archive]</a>
			</div>
		{:else}
			<div class="flex justify-end gap-1">
				{#if !isArchived}
					<a href="/goals/{goal.slug}/add" class="bracket-link text-xs">[+]</a>
					<a href="/goals/{goal.slug}/withdraw" class="bracket-link text-xs">[-]</a>
				{:else}
					<span class="text-xs text-gray-500">Read-only</span>
				{/if}
			</div>
		{/if}
	</td>
	{/if}
</tr>
