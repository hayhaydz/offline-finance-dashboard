<script lang="ts">
	import type { PageData } from './$types';
	import { formatDateTime } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';

	let { data }: { data: PageData } = $props();
</script>

<div class="p-2">
	<!-- Header -->
	<div class="flex justify-between items-center mb-2">
		<h2 class="text-base font-bold m-0">
			{data.account.name}
		</h2>
		<a href="/accounts/{data.account.slug}" class="bracket-link text-xs">
			[Account]
		</a>
	</div>

	{#if data.notes.length === 0}
		<p class="text-gray-600 text-sm">No notes yet.</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each data.notes as note}
				<div class="py-2">
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
