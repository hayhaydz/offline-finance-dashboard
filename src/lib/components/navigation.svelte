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

	const BREADCRUMB_MAX_CHARS = 24;
	function truncateLabel(label: string): string {
		return label.length > BREADCRUMB_MAX_CHARS ? label.slice(0, BREADCRUMB_MAX_CHARS) + '…' : label;
	}

	let breadcrumbEl = $state<HTMLElement | null>(null);
	$effect(() => {
		breadcrumbs(); // depend on breadcrumbs changing
		if (breadcrumbEl) breadcrumbEl.scrollLeft = breadcrumbEl.scrollWidth;
	});

	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/accounts', label: 'Accounts', authRequired: true },
		{ href: '/goals', label: 'Goals', authRequired: true },
		{ href: '/snapshots', label: 'Snapshots', authRequired: true },
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
				goals: 'Goals',
				snapshots: 'Snapshots',
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
<div bind:this={breadcrumbEl} class="bg-black text-white p-1 text-xs flex items-center overflow-x-auto whitespace-nowrap scrollbar-none">
	{#each breadcrumbs() as crumb, index}
		{#if index > 0}<span class="mx-1 flex-none">></span>{/if}
		{#if crumb.skipLink || index === breadcrumbs().length - 1}
			<span class="flex-none">{truncateLabel(crumb.label)}</span>
		{:else}
			<a href={crumb.href} class="hover:text-gray-300 flex-none">
				{truncateLabel(crumb.label)}
			</a>
		{/if}
	{/each}
</div>

<!-- Navigation Links -->
<div class="flex justify-between p-2 border-b">
	{#each navItems as item}
		{#if !item.authRequired || user}
			<a
				href={item.href}
				class="bracket-link text-xs"
				class:bg-gray-100={item.href === '/' ? currentPath === item.href : currentPath.startsWith(item.href)}
				class:font-bold={item.href === '/' ? currentPath === item.href : currentPath.startsWith(item.href)}
			>
				{item.label}
			</a>
		{/if}
	{/each}


	{#if user}
		<form action="/logout" method="POST">
			<button type="submit" class="bracket-link text-xs">Exit</button>
		</form>
	{:else}
		<a href="/login" class="bracket-link text-xs">Login</a>
	{/if}
</div>
