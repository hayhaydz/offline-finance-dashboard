<script lang="ts">
	import { Button as ButtonPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';
	
	interface Props {
		variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		class?: string;
		type?: 'button' | 'submit' | 'reset';
	};
	
	type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
	type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';
	
	let {
		variant = 'default',
		size = 'default',
		class: className = '',
		type = 'button',
		children,
		...restProps
	}: $$Props = $props();
	
	const variants: Record<ButtonVariant, string> = {
		default: 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200',
		destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
		outline: 'border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800',
		secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700',
		ghost: 'hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50',
		link: 'text-slate-900 underline-offset-4 hover:underline dark:text-slate-50'
	};
	
	const sizes: Record<ButtonSize, string> = {
		default: 'h-10 px-4 py-2',
		sm: 'h-9 rounded-md px-3',
		lg: 'h-11 rounded-md px-8',
		icon: 'h-10 w-10'
	};
</script>

<button
	{type}
	class={cn(
		'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300',
		variants[variant],
		sizes[size],
		className
	)}
	{...restProps}
>
	{@render children()}
</button>
