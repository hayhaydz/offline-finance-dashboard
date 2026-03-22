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

	interface NavItem {
		href: string;
		label: string;
		authRequired?: boolean;
		children?: NavItem[];
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

	const navItems: NavItem[] = [
		{ href: '/', label: 'Home' },
		{
			href: '/accounts',
			label: 'Accounts',
			authRequired: true,
			children: [
				{ href: '/accounts', label: 'All Accounts' },
				{ href: '/accounts/interest', label: 'Interest' },
				{ href: '/accounts/create', label: 'Create Account' }
			]
		},
		{ href: '/goals', label: 'Goals', authRequired: true, children: [
      { href: '/goals', label: 'All Goals' },
      { href: '/goals/create', label: 'Create Goal' },
      { href: '/goals/archived', label: 'Archived Goals' }
    ] },
		{ href: '/snapshots', label: 'Snapshots', authRequired: true },
		{
			href: '/settings',
			label: 'Settings',
			authRequired: true,
			children: [
				{ href: '/settings/data', label: 'Data' },
				{ href: '/settings/profile', label: 'Profile' },
				{ href: '/settings/security', label: 'Security' },
				{ href: '/settings/reference', label: 'Reference' }
			]
		}
	];

	const currentPath = $derived(page.url.pathname);

	// Track which sub-nav is currently open
	let activeSubNav = $state<string | null>(null);

	// Determine if current route is under a parent with children
	const activeParent = $derived(
		navItems.find(item => {
			if (!item.children) return false;
			// Check if current path starts with this item's href
			return currentPath.startsWith(item.href) && item.href !== '/';
		})?.href ?? null
	);

	// Auto-open sub-nav when on a child route
	$effect(() => {
		if (activeParent) {
			activeSubNav = activeParent;
		} else {
			activeSubNav = null;
		}
	});

	// Toggle function for manual sub-nav control
	function toggleSubNav(href: string) {
		activeSubNav = activeSubNav === href ? null : href;
	}

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
<div class="relative border-b">
	<!-- Main Nav Row -->
	<div class="flex items-center gap-4 p-2">
		{#each navItems as item}
			{#if !item.authRequired || user}
				{@const isActive = item.href === '/' ? currentPath === item.href : currentPath.startsWith(item.href)}
				{@const hasChildren = item.children && item.children.length > 0}
				{#if hasChildren}
					<!-- Parent item with children: prevent default navigation, use toggle -->
					<a
						href={item.href}
						onclick={(e) => { e.preventDefault(); toggleSubNav(item.href); }}
						class="bracket-link text-xs cursor-pointer"
						class:bg-gray-100={isActive}
						class:font-bold={isActive}
					>
						{item.label}
					</a>
				{:else}
					<!-- Regular link without children -->
					<a
						href={item.href}
						class="bracket-link text-xs"
						class:bg-gray-100={isActive}
						class:font-bold={isActive}
					>
						{item.label}
					</a>
				{/if}
			{/if}
		{/each}

		<!-- Push logout/login to right -->
		<div class="ml-auto">
			{#if user}
				<form action="/logout" method="POST" class="inline">
					<button type="submit" class="bracket-link text-xs">Exit</button>
				</form>
			{:else}
				<a href="/login" class="bracket-link text-xs">Login</a>
			{/if}
		</div>
	</div>

	<!-- Sub-Navigation Row (absolute positioned) -->
	{#if activeSubNav}
		{@const activeItem = navItems.find(i => i.href === activeSubNav)}
		{#if activeItem?.children}
			<div class="absolute left-0 right-0 bg-gray-50 border-b border-t z-10">
				<div class="flex gap-4 p-2">
					{#each activeItem.children as child}
						{@const isChildActive = child.href === '/' ? currentPath === child.href : currentPath.startsWith(child.href)}
						<a
							href={child.href}
							class="bracket-link text-xs"
							class:bg-gray-100={isChildActive}
							class:font-bold={isChildActive}
						>
							{child.label}
						</a>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Spacer to prevent content overlap when sub-nav is open -->
{#if activeSubNav}
	{@const activeItem = navItems.find(i => i.href === activeSubNav)}
	{#if activeItem?.children}
		<div class="h-10"></div>
	{/if}
{/if}
