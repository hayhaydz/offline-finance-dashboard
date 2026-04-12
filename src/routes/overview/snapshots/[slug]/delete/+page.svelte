<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form } = $props<{ data: PageData; form: ActionData }>();

	let dateInput = $state('');
	const confirmed = $derived(dateInput === data.snapshot.snapshotDate);
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">DELETE SNAPSHOT</h1>
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
			You are about to permanently delete the snapshot for
			<span class="font-bold">{data.snapshot.snapshotDate}</span>.
		</p>
		<p class="text-xs text-gray-600">This action cannot be undone. All financial data in this snapshot will be lost.</p>
	</div>

	<form method="POST" use:enhance>
		<div class="mb-4">
			<label for="confirm-date" class="text-sm block mb-1">
				Type <span class="font-bold">{data.snapshot.snapshotDate}</span> to confirm:
			</label>
			<input
				type="text"
				id="confirm-date"
				name="confirmDate"
				bind:value={dateInput}
				autocomplete="off"
				placeholder="YYYY-MM-DD"
				class="border border-black p-1 text-sm font-mono w-full"
			/>
		</div>

		<div class="flex gap-2">
			<button
				type="submit"
				disabled={!confirmed}
				class="bracket-link text-xs text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				[Delete Snapshot]
			</button>
			<a href="/overview/snapshots/{data.snapshot.slug}" class="bracket-link text-xs">Cancel</a>
		</div>
	</form>
</div>
