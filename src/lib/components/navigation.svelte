<script lang="ts">
	import { page } from '$app/state';

	interface BreadcrumbOverride {
		segmentIndex: number; // Which path segment to override (0 = first segment after /)
		label: string; // The label to use
		skipLink: boolean; // Don't make this a link (for pages that don't exist)
	}

	interface BreadcrumbCrumbs {
		label: string;
		href: string;
		skipLink?: boolean;
	}

	interface Props {
		user: { username: string } | null;
		environment: {
			mode: string;
			isProduction: boolean;
			hasEncryption: boolean;
		};
		breadcrumbOverrides?: BreadcrumbOverride[];
	}

	let { user, environment, breadcrumbOverrides }: Props = $props();

	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/accounts', label: 'Accounts', authRequired: true },
		{ href: '/snapshots', label: 'Snapshots', authRequired: true },
		{ href: '/goals', label: 'Goals', authRequired: true },
		{ href: '/settings', label: 'Settings', authRequired: true }
	];

	const currentPath = $derived(page.url.pathname);

	// Generate breadcrumb trail from current path
	const breadcrumbs = $derived(() => {
		const path = currentPath;
		if (path === '/') return [{ label: 'Home', href: '/' }];

		const segments = path.split('/').filter(Boolean);
		const crumbs: BreadcrumbCrumbs[] = [{ label: 'Home', href: '/' }];

		// Build a map of overrides for quick lookup
		const overrideMap = new Map<number, BreadcrumbOverride>();
		if (breadcrumbOverrides) {
			for (const override of breadcrumbOverrides) {
				overrideMap.set(override.segmentIndex, override);
			}
		}

		let buildPath = '';
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			buildPath += '/' + segment;
			const labelMap: Record<string, string> = {
				accounts: 'Accounts',
				snapshots: 'Snapshots',
				goals: 'Goals',
				settings: 'Settings',
				profile: 'Profile',
				create: 'Create',
				balances: 'Balances',
				edit: 'Edit',
				delete: 'Close'
			};

			// Use override if provided, otherwise use labelMap or segment
			let label: string;
			let skipLink = false;
			if (overrideMap.has(i)) {
				const override = overrideMap.get(i)!;
				label = override.label;
				skipLink = override.skipLink;
			} else {
				label = labelMap[segment] || segment;
			}

			crumbs.push({
				label,
				href: buildPath,
				skipLink
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
		{#if crumb.skipLink || index === breadcrumbs().length - 1}
			<span>{crumb.label}</span>
		{:else}
			<a href={crumb.href} class="hover:text-gray-300">
				{crumb.label}
			</a>
		{/if}
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
