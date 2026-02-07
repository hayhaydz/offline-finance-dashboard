<script lang="ts">
	import { Button } from './ui/index';
	import { onMount } from 'svelte';
	
	let isDark = $state(false);
	
	onMount(() => {
		// Check initial theme
		const theme = localStorage.getItem('theme') || 'system';
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		isDark = theme === 'dark' || (theme === 'system' && prefersDark);
	});
	
	function toggleTheme() {
		isDark = !isDark;
		const newTheme = isDark ? 'dark' : 'light';
		
		// Update localStorage
		localStorage.setItem('theme', newTheme);
		
		// Update DOM
		document.documentElement.classList.toggle('dark', isDark);
	}
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggleTheme}
	aria-label="Toggle theme"
	class="rounded-full"
>
	{#if isDark}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide-sun"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="m4.93 4.93 1.41 1.41" />
			<path d="m17.66 17.66 1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="m6.34 17.66-1.41 1.41" />
			<path d="m19.07 4.93-1.41 1.41" />
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide-moon"
		>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	{/if}
</Button>
