<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		value: string;
		selectedValue: string;
		onChange: (value: string) => void;
		children: Snippet;
		disabled?: boolean;
	}

	let { value, selectedValue, onChange, children, disabled = false }: Props = $props();

	const isSelected = $derived(selectedValue === value);

	function handleClick() {
		if (!disabled) {
			onChange(value);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onChange(value);
		}
	}
</script>

<!-- Terminal-style radio toggle: [.] or [ ] -->
<div
	class="flex items-center gap-1 cursor-pointer select-none hover:bg-gray-100 focus:outline focus:outline-1 focus:outline-black focus:outline-offset-2"
	class:opacity-50={disabled}
	class:cursor-not-allowed={disabled}
	onclick={handleClick}
	onkeydown={handleKeydown}
	tabindex={disabled ? -1 : 0}
	role="radio"
	aria-checked={isSelected}
>
	<span class="font-bold font-terminal">{isSelected ? '[•]' : '[ ]'}</span>
	<span>
		{@render children()}
	</span>
</div>
