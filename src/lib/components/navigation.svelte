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
    // For child links: whether to highlight when on child routes (e.g., /accounts/123)
    // Default: false (only highlight on exact match)
    includeChildRoutes?: boolean;
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
  
  // Track which sub-nav is currently open
  let activeSubNav = $state<string | null>(null);

  const navItems: NavItem[] = [
    { href: '/', label: 'Home' },
    {
      href: '/accounts',
      label: 'Accounts',
      authRequired: true,
      children: [
        { href: '/accounts', label: 'All Accounts', includeChildRoutes: true },
        { href: '/accounts/interest', label: 'Interest' },
        { href: '/accounts/isa', label: 'ISA' },
        { href: '/accounts/liabilities', label: 'Liabilities' },
        { href: '/accounts/create', label: 'Create Account' }
      ]
    },
    { href: '/goals', label: 'Goals', authRequired: true, children: [
      { href: '/goals', label: 'All Goals', includeChildRoutes: true },
      { href: '/goals?type=debt', label: 'Debt Payoff' },
      { href: '/goals/create', label: 'Create Goal' },
      { href: '/goals/archived', label: 'Archived Goals' }
    ] },
    { href: '/overview', label: 'Overview', authRequired: true, children: [
      { href: '/overview/snapshots', label: 'Snapshots', includeChildRoutes: true },
      { href: '/overview/routine', label: 'Routine', includeChildRoutes: true },
      { href: '/overview/budgets', label: 'Budgets' },
      { href: '/overview/expenses', label: 'Expenses' },
      { href: '/overview/reports', label: 'Reports' },
      { href: '/overview/tax', label: 'Tax', includeChildRoutes: true }
    ]},
    { href: '/alerts', label: 'Alerts', authRequired: true },
    { href: '/tools', label: 'Tools', authRequired: true },
    {
      href: '/settings',
      label: 'Settings',
      authRequired: true,
      children: [
        { href: '/settings/general', label: 'General' },
        { href: '/settings/profile', label: 'Session & Security' },
        { href: '/settings/security', label: 'Security' },
        { href: '/settings/data', label: 'Data' }
      ]
    }
  ];

  const currentPath = $derived(page.url.pathname);
  const currentSearch = $derived(page.url.search);

  // Matches a child nav href (which may carry a query string like /goals?type=debt)
  // against the current route. Query-qualified hrefs must match the query too,
  // so /goals?type=debt only highlights when that filter is active.
  function isChildRouteActive(child: NavItem): boolean {
    const hrefUrl = new URL(child.href, 'http://nav.local');
    const path = hrefUrl.pathname;
    const query = hrefUrl.searchParams;

    if (path === '/') return currentPath === '/';

    const pathMatches =
      currentPath === path || currentPath.startsWith(path + '/');
    if (!pathMatches) return false;

    if (query.size > 0) {
      for (const [key, value] of query) {
        if (currentSearchParams.get(key) !== value) return false;
      }
    }
    return true;
  }

  const currentSearchParams = $derived.by(() => new URLSearchParams(currentSearch));

  // Auto-open subnav matching the current route
  $effect(() => {
    const path = currentPath; // depend on route changes
    const matchingParent = navItems.find(
      (item) => item.children && item.children.some((child) => isChildRouteActive(child))
    );
    activeSubNav = matchingParent?.href ?? null;
  });

  // Generate breadcrumb trail from current path (Updated to use $derived.by)
  const breadcrumbs = $derived.by(() => {
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
        debt: 'Debt Payoff',
        overview: 'Overview',
        routine: 'Routine',
        budgets: 'Budgets',
        reports: 'Reports',
        snapshots: 'Snapshots',
        tax: 'Tax',
        income: 'Income',
        settings: 'Settings',
        tools: 'Tools',
        profile: 'Session & Security',
        create: 'Create',
        isa: 'ISA',
        interest: 'Interest',
        liabilities: 'Liabilities',
        balances: 'Balances',
        edit: 'Edit',
        delete: 'Close',
        all: 'All',
        // P2-1 (2026-10-27 audit): title-case every crumb consistently
        expenses: 'Expenses',
        alerts: 'Alerts',
        general: 'General',
        security: 'Security',
        data: 'Data',
        login: 'Login',
        register: 'Register',
        unlock: 'Unlock',
        recovery: 'Recovery',
        review: 'Review',
        notes: 'Notes',
        archived: 'Archived',
        confirm: 'Confirm',
        payoffs: 'Payoffs',
        breakdown: 'Breakdown',
        uncategorised: 'Uncategorised',
        csv: 'CSV'
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

  // Update breadcrumb scrolling effect to watch the derived array correctly
  $effect(() => {
    breadcrumbs; // depend on breadcrumbs changing
    if (breadcrumbEl) breadcrumbEl.scrollLeft = breadcrumbEl.scrollWidth;
  });

  // Environment badge for development
  const showDevBadge = $derived(!environment.isProduction);
</script>

<div bind:this={breadcrumbEl} class="bg-black text-white p-1 text-xs flex items-center overflow-x-auto whitespace-nowrap scrollbar-none no-print">
  {#each breadcrumbs as crumb, index}
    {#if index > 0}<span class="mx-1 flex-none">></span>{/if}
    {#if crumb.skipLink || index === breadcrumbs.length - 1}
      <span class="flex-none">{truncateLabel(crumb.label)}</span>
    {:else}
      <a href={crumb.href} class="hover:text-gray-300 flex-none">
        {truncateLabel(crumb.label)}
      </a>
    {/if}
  {/each}
</div>

<div class="relative border-b">
  <div class="flex items-center gap-4 p-2">
    {#each navItems as item}
      {#if !item.authRequired || user}
        {@const isActive = item.href === '/' ? currentPath === item.href : currentPath.startsWith(item.href)}
        <a
          href={item.href}
          class="bracket-link text-xs"
          class:bg-gray-100={isActive}
          class:font-bold={isActive}
        >
          {item.label}
        </a>
      {/if}
    {/each}

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

  {#if activeSubNav}
    {@const activeItem = navItems.find(i => i.href === activeSubNav)}
    {#if activeItem?.children}
      <div class="bg-gray-50 border-t">
        <div class="flex gap-4 p-2 min-h-8 items-center">
          {#each activeItem.children as child}
            {@const isChildActive = (() => {
              if (!isChildRouteActive(child)) return false;
              if (!child.includeChildRoutes) return true;
              // Broad "include child routes" entries (e.g. All Goals) defer to
              // any more specific sibling that also matches (e.g. Debt Payoff).
              const otherSiblings = activeItem.children?.filter((c) => c !== child) ?? [];
              return !otherSiblings.some((sib) => isChildRouteActive(sib));
            })()}
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