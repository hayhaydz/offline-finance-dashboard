<script lang="ts">
	import type { PageData } from './$types';
	import { formatDate, truncateDisplay } from '$lib/utils/currency';
	import { DISPLAY_LIMITS } from '$lib/utils/fieldLimits';

	let { data }: { data: PageData } = $props();
</script>

<div class="p-2">
	<!-- Header -->
	<div class="flex justify-between items-center mb-2">
		<h2 class="text-base font-bold m-0">
			Notes for {data.account.name}
		</h2>
		<a href="/accounts/{data.account.slug}" class="bracket-link text-xs">
			[Back to Account]
		</a>
	</div>

	{#if data.notes.length === 0}
		<p class="text-gray-600 text-sm">No notes yet.</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each data.notes as note}
				<div class="py-2">
					<a
						href="/accounts/{data.account.slug}/notes/{note.slug}"
						class="block hover:bg-gray-50"
					>
						<div class="flex justify-between items-start gap-2 mb-1">
							<span class="text-sm font-medium">
								{truncateDisplay(note.content, DISPLAY_LIMITS.NOTE_CONTENT)}
							</span>
							<span class="text-xs text-gray-500 whitespace-nowrap">
								{formatDate(note.createdAt)}
							</span>
						</div>
					</a>
				</div>
			{/each}
		</div>
	{/if}
</div>
