<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDateTime } from '$lib/utils/currency';
	import { truncateDisplay, DISPLAY_LIMITS } from '$lib/utils/fieldLimits';
	import type { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';

	type Note = {
		slug: string;
		content: string;
		createdAt: Date;
	};

	let {
		accountSlug,
		notes,
		closedAt,
		addNoteOpen,
		feedback,
	}: {
		accountSlug: string;
		notes: Note[];
		closedAt: Date | null;
		addNoteOpen: boolean;
		feedback: ReturnType<typeof useSubmitFeedback>;
	} = $props();
</script>

<div class="border-t border-black">
	<div class="border-b border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>NOTES ({notes.length})</span>
		{#if !closedAt}
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => addNoteOpen = !addNoteOpen}
			>
				{addNoteOpen ? '[Cancel]' : '[Add Note]'}
			</button>
		{/if}
	</div>

	{#if addNoteOpen && !closedAt}
		<div class="border-b border-black p-2 bg-gray-50">
			<form
				method="POST"
				action="?/addNote"
				use:enhance={feedback.createEnhanceHandler('Note added successfully', { resetForm: true, onSuccess: () => { addNoteOpen = false; } })}
				class="flex flex-col gap-2"
			>
				<div>
					<label for="noteContent" class="block text-sm font-bold mb-1">Note</label>
					<textarea
						id="noteContent"
						name="content"
						rows="4"
						maxlength="5000"
						placeholder="Opened this for the 5.1% rate, will review when it drops..."
						required
						class="w-full border border-black px-2 py-1 text-sm font-mono"
					></textarea>
					<div class="text-xs text-gray-600 mt-1">Max 5000 characters</div>
				</div>
				<div>
					<button
						type="submit"
						disabled={feedback.isSubmitting}
						class="bracket-link text-sm"
						class:opacity-50={feedback.isSubmitting}
					>
						{feedback.isSubmitting ? 'Adding...' : 'Add Note'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if notes.length === 0}
		<p class="text-gray-600 text-xs p-2">No notes yet. Add context for your future self.</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each notes as note}
				<div class="p-2">
					<div class="flex justify-between items-start gap-2">
						<div class="text-sm text-gray-700 whitespace-pre-wrap flex-1">
							{truncateDisplay(note.content, DISPLAY_LIMITS.NOTE_CONTENT)}
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<a
								href="/accounts/{accountSlug}/notes/{note.slug}"
								class="bracket-link text-xs"
							>
								{formatDateTime(note.createdAt)}
							</a>
							{#if !closedAt}
								<form
									method="POST"
									action="?/deleteNote"
									class="inline"
									use:enhance={feedback.createEnhanceHandler("Note deleted")}
								>
									<input type="hidden" name="noteSlug" value={note.slug} />
									<button
										type="submit"
										class="text-xs text-red-700"
										onclick={(e) => { if (!confirm('Delete this note?')) e.preventDefault(); }}
									>
										[Delete]
									</button>
								</form>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
