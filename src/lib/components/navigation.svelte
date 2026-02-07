<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		user: { username: string } | null;
	}

	let { user }: Props = $props();

	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/app', label: 'Accounts', authRequired: true },
		{ href: '/snapshots', label: 'Snapshots', authRequired: true },
		{ href: '/settings', label: 'Settings', authRequired: true }
	];

	const currentPath = $derived($page.url.pathname);
</script>

<div class="flex justify-between p-2 bg-gray-100 border-t border-black">
	{#each navItems as item}
		{#if !item.authRequired || user}
			<a
				href={item.href}
				class="bracket-link"
				class:active={currentPath === item.href}
				style:background-color={currentPath === item.href ? 'black' : ''}
				style:color={currentPath === item.href ? 'white' : ''}
			>
				{item.label}
			</a>
		{/if}
	{/each}

	{#if user}
		<form action="/logout" method="POST">
			<button type="submit" class="bracket-link">Exit</button>
		</form>
	{:else}
		<a href="/login" class="bracket-link">Login</a>
	{/if}
</div>

<style>
	/* Active state for current page */
	.bracket-link.active {
		background: black;
		color: white;
	}

	/* Reset button styles for bracket link buttons */
	button.bracket-link {
		background: none;
		border: none;
		font-family: inherit;
		font-size: inherit;
		cursor: pointer;
		padding: 0 2px;
	}

	button.bracket-link::before {
		content: '[';
	}

	button.bracket-link::after {
		content: ']';
	}
</style>
