<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import type { PageData, ActionData } from './$types';

	let { data, form } = $props<{
		data: PageData;
		form: ActionData;
	}>();

	let nameInput = $state('');
	const confirmed = $derived(nameInput === data.goal.name);
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0 truncate">ARCHIVE: {truncateDisplay(data.goal.name, DISPLAY_LIMITS.GOAL_NAME)}</h1>
</div>

<div class="p-2">
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<div class="border border-black p-4 mb-4 bg-amber-50">
		<div class="font-bold text-sm mb-2">⚠ CONFIRMATION REQUIRED</div>
		<p class="text-sm mb-2">
			You are about to archive <span class="font-bold">{truncateDisplay(data.goal.name, DISPLAY_LIMITS.GOAL_NAME)}</span>.
		</p>
		<p class="text-sm mb-2">
			This will return <span class="font-bold">{formatCurrency(data.goal.currentAllocation)}</span> to Ready to Assign.
		</p>
		<p class="text-xs text-gray-600">
			The goal will be moved to the Archived section and can be viewed there, but cannot be edited or modified.
		</p>
	</div>

	<form method="POST" use:enhance>
		<div class="mb-4">
			<label for="confirm-name" class="text-sm block mb-1">
				Type <span class="font-bold">{data.goal.name}</span> to confirm:
			</label>
			<input
				type="text"
				id="confirm-name"
				bind:value={nameInput}
				autocomplete="off"
				class="border border-black p-1 text-sm font-mono w-full"
			/>
		</div>

		<div class="flex gap-2">
			<button
				type="submit"
				disabled={!confirmed}
				class="bracket-link text-xs text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				[Confirm Archive]
			</button>
			<a href="/goals/{data.goal.slug}" class="bracket-link text-xs">Cancel</a>
		</div>
	</form>
</div>
