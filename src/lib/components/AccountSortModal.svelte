<script lang="ts">
	type SortBy = '' | 'name' | 'type' | 'institution' | 'balance' | 'updated';

	interface Props {
		open: boolean;
		onClose: () => void;
		onApply: (sortBy: SortBy) => void;
		currentSort: SortBy;
	}

	let { open, onClose, onApply, currentSort }: Props = $props();

	// Sort options: value maps to the sortBy state
	const sortOptions: { value: SortBy; label: string }[] = [
		{ value: '', label: 'Default Order' },
		{ value: 'name', label: 'Name (A-Z)' },
		{ value: 'type', label: 'Account Type' },
		{ value: 'institution', label: 'Institution' },
		{ value: 'balance', label: 'Balance (Low to High)' },
		{ value: 'updated', label: 'Last Updated (Newest)' }
	];

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) onClose();
		if (e.key === 'Enter' && open) onApply(currentSort);
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleBackdropKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) onClose();
	}

	function selectSort(value: SortBy) {
		onApply(value);
		onClose();
	}

	function handleSortKeydown(e: KeyboardEvent, value: SortBy) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			selectSort(value);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="sort-modal-title"
		tabindex="-1"
	>
		<div
			class="bg-white border-2 border-black shadow-hard w-full max-w-sm flex flex-col max-h-[90vh]"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<!-- Header -->
			<div class="bg-black text-white px-3 py-2 flex justify-between items-center font-bold">
				<span id="sort-modal-title" class="tracking-tighter">SORT_ACCOUNTS // SELECT_ORDER</span>
				<button type="button" class="hover:bg-red-600 px-1" onclick={onClose}>[X]</button>
			</div>

			<!-- Sort Options -->
			<div class="flex-1 overflow-y-auto border-b border-black divide-y divide-gray-200">
				{#each sortOptions as opt}
					<div
						class="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 group"
						onclick={() => selectSort(opt.value)}
						role="button"
						tabindex="0"
						onkeydown={(e) => handleSortKeydown(e, opt.value)}
					>
						<span class="font-bold font-mono text-sm">
							{currentSort === opt.value ? '[X]' : '[ ]'}
						</span>
						<span class={currentSort === opt.value ? 'font-bold' : ''}>{opt.label}</span>
					</div>
				{/each}
			</div>

			<!-- Footer -->
			<div class="p-3 bg-gray-50">
				<button
					type="button"
					class="w-full border border-black py-2 text-xs font-bold hover:bg-black hover:text-white transition-colors"
					onclick={onClose}
				>
					CANCEL
				</button>
			</div>
		</div>
	</div>
{/if}
