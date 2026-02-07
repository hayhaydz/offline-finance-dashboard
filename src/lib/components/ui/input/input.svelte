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
		'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300',
		className
	)}
/>
