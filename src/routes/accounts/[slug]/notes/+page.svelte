<script lang="ts">
	import type { PageData } from './$types';
	import { formatDateTime } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';

	let { data }: { data: PageData } = $props();
</script>

<!-- v3.1 third mandate (border doctrine): the notes index joins the
     inset-panel system — title band inside a boxed panel, notes as
     ruled rows (was: full-bleed divide-y list with no frame). -->
<div class="p-2">
	<div class="border border-black">
		<div class="flex justify-between items-center bg-gray-100 border-b border-black p-2">
			<h2 class="text-base font-bold m-0">
				{data.account.name} — NOTES
			</h2>
			<a href="/accounts/{data.account.slug}" class="bracket-link text-xs">
				Account
			</a>
		</div>

		{#if data.notes.length === 0}
			<p class="text-gray-600 text-sm p-2">No notes yet.</p>
		{:else}
			<div>
				{#each data.notes as note, i (note.slug)}
					<div class="p-2 {i < data.notes.length - 1 ? 'border-b border-gray-200' : ''}">
						<div class="mb-1 text-sm whitespace-pre-wrap">
							{truncateDisplay(note.content, DISPLAY_LIMITS.NOTE_CONTENT)}
						</div>
						<a
							href="/accounts/{data.account.slug}/notes/{note.slug}"
							class="bracket-link text-xs"
						>
							{formatDateTime(note.createdAt)}
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
