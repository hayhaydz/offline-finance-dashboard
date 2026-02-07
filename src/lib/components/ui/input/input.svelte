<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		type?: 'text' | 'email' | 'password' | 'number';
		placeholder?: string;
		value?: string;
		class?: string;
		required?: boolean;
		disabled?: boolean;
		name?: string;
		id?: string;
	}

	let {
		type = 'text',
		placeholder = '',
		value = '',
		class: className = '',
		required = false,
		disabled = false,
		name,
		id
	}: Props = $props();
</script>

<input
	{type}
	{placeholder}
	{value}
	{name}
	{id}
	{required}
	{disabled}
	class={cn(
		'border border-black p-1 w-full font-terminal text-sm focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed',
		className
	)}
/>
