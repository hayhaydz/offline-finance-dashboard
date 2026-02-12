<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		value: string;
		checked: boolean;
		onChange: (checked: boolean) => void;
		children: Snippet;
		disabled?: boolean;
	}

	let { value, checked, onChange, children, disabled = false }: Props = $props();

	function handleClick() {
		if (!disabled) {
			onChange(!checked);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onChange(!checked);
		}
	}
</script>

<!-- Terminal-style checkbox: [X] or [ ] -->
<div
	class="flex items-center gap-1 cursor-pointer select-none hover:bg-gray-100 focus:outline focus:outline-1 focus:outline-black focus:outline-offset-2"
	class:opacity-50={disabled}
	class:cursor-not-allowed={disabled}
	onclick={handleClick}
	onkeydown={handleKeydown}
	tabindex={disabled ? -1 : 0}
	role="checkbox"
	aria-checked={checked}
>
	<span class="font-bold font-terminal">{checked ? '[X]' : '[ ]'}</span>
	<span>
		{@render children()}
	</span>
</div>
