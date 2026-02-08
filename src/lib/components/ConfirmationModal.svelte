<script lang="ts">
	interface Props {
		title: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		title,
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		onConfirm,
		onCancel
	}: Props = $props();

	// Handle keyboard shortcuts (Escape to cancel, Enter to confirm)
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		} else if (e.key === 'Enter') {
			onConfirm();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
	<div class="bg-white border-2 border-black p-4 max-w-md w-full mx-4">
		<h2 class="text-base font-bold mb-2 mt-0">{title}</h2>
		<p class="mb-4 text-sm">{message}</p>

		<div class="flex gap-2 justify-end">
			<button
				onclick={onCancel}
				class="bracket-link px-3 py-1 border border-black hover:bg-gray-200 text-sm"
				type="button"
			>
				[{cancelText}]
			</button>
			<button
				onclick={onConfirm}
				class="px-3 py-1 border border-black bg-red-700 text-white hover:bg-red-800 text-sm font-bold"
				type="button"
			>
				[{confirmText}]
			</button>
		</div>
	</div>
</div>

<style>
	/* Modal backdrop */
	:global(.fixed) {
		position: fixed;
	}
</style>
