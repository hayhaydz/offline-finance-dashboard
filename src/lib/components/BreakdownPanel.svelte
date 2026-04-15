<script lang="ts">
	import type { Snippet } from 'svelte';

	type TabId = 'account' | 'month' | 'institution' | 'wrapper';

	let {
		activeTab = $bindable('account' as TabId),
		account,
		month,
		institution,
		wrapper,
		sortLabel = '',
		onSortToggle,
	}: {
		activeTab?: TabId;
		account: Snippet;
		month: Snippet;
		institution: Snippet;
		wrapper: Snippet;
		sortLabel?: string;
		onSortToggle?: () => void;
	} = $props();

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'account', label: 'By Account' },
		{ id: 'month', label: 'By Month' },
		{ id: 'institution', label: 'By Institution' },
		{ id: 'wrapper', label: 'By Tax Wrapper' },
	];
</script>

<div class="flex justify-between items-center border-b border-black p-2 gap-2">
	<div class="flex gap-2">
		{#each tabs as tab}
			<button
				type="button"
				class="bracket-link text-xs"
				class:bg-black={activeTab === tab.id}
				class:text-white={activeTab === tab.id}
				onclick={() => activeTab = tab.id}
			>
				{tab.label}
			</button>
		{/each}
	</div>
	{#if onSortToggle}
		<button type="button" class="bracket-link text-xs" onclick={onSortToggle}>
			{sortLabel}
		</button>
	{/if}
</div>

{#if activeTab === 'account'}
	{@render account()}
{:else if activeTab === 'month'}
	{@render month()}
{:else if activeTab === 'institution'}
	{@render institution()}
{:else if activeTab === 'wrapper'}
	{@render wrapper()}
{/if}
