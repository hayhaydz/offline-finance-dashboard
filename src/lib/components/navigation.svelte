<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		user: { username: string } | null;
		environment: {
			mode: string;
			isProduction: boolean;
			hasEncryption: boolean;
		};
	}

	let { user, environment }: Props = $props();

	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/accounts', label: 'Accounts', authRequired: true },
		{ href: '/snapshots', label: 'Snapshots', authRequired: true },
		{ href: '/settings', label: 'Settings', authRequired: true }
	];

	const currentPath = $derived($page.url.pathname);

	// Environment badge for development
	const showDevBadge = $derived(!environment.isProduction);
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

	{#if showDevBadge}
		<span class="text-red-700 font-bold text-xs px-1">[!] DEV DATA [!]</span>
	{/if}

	{#if user}
		<form action="/logout" method="POST">
			<button type="submit" class="bracket-link">Exit</button>
		</form>
	{:else}
		<a href="/login" class="bracket-link">Login</a>
	{/if}
</div>
