<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { formatCurrency, formatCurrencyShorthand } from '$lib/utils/currency';

	let { data } = $props();
	const { review, checklistItems, goalProgress, yearMonth, label, isCurrentMonth } = $derived(data);

	// Optimistic state for checklist — untrack suppresses the "initial value only" warning:
	// we intentionally seed from props once, then keep in sync via $effect on navigation.
	let completedItems = $state<string[]>(untrack(() => [...(data.review.completedItems ?? [])]));
	let pendingToggle = $state<string | null>(null);

	$effect(() => {
		completedItems = [...(review.completedItems ?? [])];
	});

	function isChecked(key: string): boolean {
		return completedItems.includes(key);
	}

	const completedCount = $derived(completedItems.length);
	const totalItems = $derived(checklistItems.length);
	const allDone = $derived(completedCount === totalItems);

	// ASCII progress bar (20 chars wide)
	function progressBar(percent: number, width = 20): string {
		const filled = Math.round((percent / 100) * width);
		return '█'.repeat(filled) + '░'.repeat(width - filled);
	}

	// MoM delta display
	function momLabel(delta: number | null): string {
		if (delta === null) return '—';
		if (delta === 0) return '=';
		return delta > 0 ? `+${formatCurrencyShorthand(delta)}` : formatCurrencyShorthand(delta);
	}

	function momClass(delta: number | null): string {
		if (delta === null || delta === 0) return 'text-gray-400';
		return delta > 0 ? 'text-green-700' : 'text-red-700';
	}
</script>

<!-- Month header -->
<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
	<div class="flex items-center gap-2">
		<a href="/overview/routine" class="bracket-link text-xs">Reviews</a>
		<span>/ {label.toUpperCase()}</span>
	</div>
	{#if isCurrentMonth}
		<span class="text-xs text-gray-500">Current month</span>
	{/if}
</div>

<!-- Progress summary -->
<div class="border-b border-black p-2 flex justify-between items-center">
	<span class="text-sm">
		Checklist:
		<span
			class="font-bold"
			class:text-green-700={allDone}
			class:text-amber-700={completedCount > 0 && !allDone}
			class:text-gray-500={completedCount === 0}
		>
			{completedCount}/{totalItems}
		</span>
		{#if allDone}
			<span class="text-green-700 font-bold ml-2">[COMPLETE]</span>
		{/if}
	</span>
	<span class="text-xs font-mono bar-chart text-gray-400">
		{progressBar(Math.round((completedCount / totalItems) * 100), 12)}
	</span>
</div>

<!-- CHECKLIST -->
<div class="font-bold bg-gray-100 border-b border-black p-2 text-xs uppercase">Checklist</div>
<div class="border-b border-black">
	{#each checklistItems as item}
		{@const checked = isChecked(item.key)}
		{@const isPending = pendingToggle === item.key}
		<div class="border-b border-gray-100 last:border-0 p-2 flex items-start gap-3">
			<form
				method="POST"
				action="?/toggle"
				use:enhance={() => {
					pendingToggle = item.key;
					// Optimistic update
					if (checked) {
						completedItems = completedItems.filter(k => k !== item.key);
					} else {
						completedItems = [...completedItems, item.key];
					}
					return async ({ result, update }) => {
						pendingToggle = null;
						if (result.type === 'success' && result.data?.completedItems) {
							completedItems = result.data.completedItems as string[];
						} else {
							// Revert optimistic update on failure
							await update();
						}
					};
				}}
				class="flex-shrink-0 mt-0.5"
			>
				<input type="hidden" name="reviewSlug" value={review.slug} />
				<input type="hidden" name="itemKey" value={item.key} />
				<button
					type="submit"
					disabled={isPending}
					class="font-mono text-base leading-none cursor-pointer hover:opacity-70 disabled:opacity-40"
					class:text-green-700={checked}
					class:text-gray-300={!checked}
					title={checked ? 'Mark incomplete' : 'Mark complete'}
				>
					{checked ? '[✓]' : '[ ]'}
				</button>
			</form>
			<div class="flex-1 min-w-0">
				<div class="text-sm font-bold" class:line-through={checked} class:text-gray-400={checked}>
					{item.label}
				</div>
				<div class="text-xs text-gray-500">{item.description}</div>
			</div>
		</div>
	{/each}
</div>

<!-- GOAL PROGRESS -->
{#if goalProgress.length > 0}
	<div class="font-bold bg-gray-100 border-b border-black p-2 text-xs uppercase">
		Goal Progress
	</div>
	<div class="border-b border-black">
		<table>
			<thead>
				<tr>
					<th class="pl-2 text-left">Goal</th>
					<th class="text-right pr-1">Target</th>
					<th class="text-right pr-1">Saved</th>
					<th class="text-center px-1">%</th>
					<th class="text-center px-1">MoM</th>
					<th class="pl-1 text-left hidden md:table-cell">Progress</th>
				</tr>
			</thead>
			<tbody>
				{#each goalProgress as goal}
					<tr class="border-t border-gray-100">
						<td class="pl-2 py-1">
							<a href="/goals/{goal.slug}" class="bracket-link text-xs">{goal.name}</a>
						</td>
						<td class="text-right pr-1 tabular-nums py-1 text-xs">
							{formatCurrencyShorthand(goal.targetAmountInCents)}
						</td>
						<td class="text-right pr-1 tabular-nums py-1 text-xs">
							{formatCurrency(goal.currentAllocation)}
						</td>
						<td class="text-center tabular-nums py-1 text-xs"
							class:text-green-700={goal.percent >= 100}
							class:text-amber-700={goal.percent >= 50 && goal.percent < 100}
						>
							{goal.percent}%
						</td>
						<td class="text-center tabular-nums py-1 text-xs {momClass(goal.momDelta)}">
							{momLabel(goal.momDelta)}
						</td>
						<td class="pl-1 py-1 font-mono text-xs bar-chart hidden md:table-cell text-gray-400">
							{progressBar(goal.percent, 16)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- NOTES -->
<div class="font-bold bg-gray-100 border-b border-black p-2 text-xs uppercase">Notes</div>
<div class="border-b border-black p-2">
	<form method="POST" action="?/saveNotes" use:enhance>
		<input type="hidden" name="reviewSlug" value={review.slug} />
		<textarea
			name="notes"
			rows="3"
			placeholder="Any observations, changes or reminders for this month..."
			class="w-full font-mono text-sm border border-black p-1 resize-none focus:outline-none"
		>{review.notes ?? ''}</textarea>
		<div class="flex justify-end mt-1">
			<button type="submit" class="bracket-link text-xs">Save Notes</button>
		</div>
	</form>
</div>
