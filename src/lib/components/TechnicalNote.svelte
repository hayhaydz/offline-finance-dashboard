<script lang="ts">
	/**
	 * Technical note with [i] expander (proposal #8, 2026-10-27 audit).
	 * Collapsed by default to one bracket link; expands to the sentence-case
	 * note. Replaces the always-shouted "[TECHNICAL NOTE]" uppercase blocks.
	 */
	let { note }: { note: string } = $props();

	let open = $state(false);
</script>

<div class="text-[10px] text-gray-600 border-t border-black font-mono">
	{#if open}
		<button
			type="button"
			class="bracket-link text-[10px] py-1"
			onclick={() => (open = false)}
		>
			[-] technical note
		</button>
		<p class="pb-1 pr-2">{note}</p>
	{:else}
		<button
			type="button"
			class="bracket-link text-[10px] py-1"
			onclick={() => (open = true)}
		>
			[i] technical note
		</button>
	{/if}
</div>
