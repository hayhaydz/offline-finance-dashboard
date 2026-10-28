<script lang="ts">
	/**
	 * Styled confirmation modal (P2-2, 2026-10-27 audit) — replaces native
	 * confirm() dialogs. Terminal aesthetic: black borders, no rounding,
	 * no shadows, bracket-link buttons, semantic red for the destructive
	 * action.
	 */
	let {
		open,
		title = 'CONFIRM ACTION',
		message,
		details,
		confirmLabel = '[Delete]',
		cancelLabel = '[Cancel]',
		onConfirm,
		onCancel
	}: {
		open: boolean;
		title?: string;
		message: string;
		/** Optional supporting lines (e.g. transaction date/amount). */
		details?: string[];
		confirmLabel?: string;
		cancelLabel?: string;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div
		class="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
		style="z-index: 60"
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<div class="bg-white border-2 border-black w-full max-w-md">
			<div class="border-b border-black bg-gray-100 px-2 py-1 font-bold text-sm uppercase tracking-widest">
				{title}
			</div>
			<div class="p-3">
				<p class="text-sm mb-2">{message}</p>
				{#if details && details.length > 0}
					<ul class="text-xs text-gray-600 mb-1">
						{#each details as line}
							<li>{line}</li>
						{/each}
					</ul>
				{/if}
				<p class="text-[10px] text-gray-500 mt-2">This action cannot be undone.</p>
			</div>
			<div class="border-t border-black p-2 flex gap-3 justify-end">
				<button type="button" class="bracket-link text-xs" onclick={onCancel}>
					{cancelLabel}
				</button>
				<button
					type="button"
					class="bracket-link text-xs font-bold text-red-700"
					onclick={onConfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
