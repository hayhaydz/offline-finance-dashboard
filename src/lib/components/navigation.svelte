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
				class="bracket-link {currentPath === item.href ? 'bg-black text-white' : ''}"
			>
				{item.label}
			</a>
		{/if}
	{/each}

	{#if user}
		<form action="/logout" method="POST">
			<button type="submit" class="bracket-link bg-transparent border-none font-inherit text-inherit cursor-pointer px-1 before:content-['['] after:content-[']']">
				Exit
			</button>
		</form>
	{:else}
		<a href="/login" class="bracket-link">Login</a>
	{/if}
</div>
