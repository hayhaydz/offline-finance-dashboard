<script lang="ts">
	import { page } from '$app/state';

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

	const currentPath = $derived(page.url.pathname);

	// Generate breadcrumb trail from current path
	const breadcrumbs = $derived(() => {
		const path = currentPath;
		if (path === '/') return [{ label: 'Home', href: '/' }];

		const segments = path.split('/').filter(Boolean);
		const crumbs = [{ label: 'Home', href: '/' }];

		let buildPath = '';
		for (const segment of segments) {
			buildPath += '/' + segment;
			const labelMap: Record<string, string> = {
				accounts: 'Accounts',
				snapshots: 'Snapshots',
				settings: 'Settings',
				profile: 'Profile',
				create: 'Create',
				edit: 'Edit',
				delete: 'Close'
			};
			crumbs.push({
				label: labelMap[segment] || segment,
				href: buildPath
			});
		}
		return crumbs;
	});

	// Environment badge for development
	const showDevBadge = $derived(!environment.isProduction);
</script>

<!-- Breadcrumb Trail -->
<div class="bg-black text-white p-1 text-xs">
	{#each breadcrumbs() as crumb, index}
		{#if index > 0}<span class="mx-1">></span>{/if}
		<a href={crumb.href} class="hover:text-gray-300">
			{crumb.label}
		</a>
	{/each}
</div>

<!-- Navigation Links -->
<div class="flex justify-between p-2">
	{#each navItems as item}
		{#if !item.authRequired || user}
			<a
				href={item.href}
				class="bracket-link text-xs {currentPath === item.href ? 'bg-white' : ''}"
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
			<button type="submit" class="bracket-link text-xs">Exit</button>
		</form>
	{:else}
		<a href="/login" class="bracket-link text-xs">Login</a>
	{/if}
</div>
