<script lang="ts">
	import AlertsSection from '$lib/components/AlertsSection.svelte';
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import IsaAllowanceWidget from '$lib/components/IsaAllowanceWidget.svelte';
	import TaxYearProgress from '$lib/components/TaxYearProgress.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import { formatCurrency, formatCurrencyShorthand, formatAccountType, formatDateShorthand } from '$lib/utils/currency';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';

	let { data } = $props();
	let { user, environment: env, goals } = $derived(data);

	// Accordion state for interest section
	let interestExpanded = $state(false);

	// Pagination state with scroll targets
	let accountsSectionRef: HTMLElement | null = $state(null);
	let goalsSectionRef: HTMLElement | null = $state(null);
	let accountsPage = $state(0);
	let goalsPage = $state(0);

	// Track if we're updating to prevent loops
	let isUpdatingAccountsPage = $state(false);
	let isUpdatingGoalsPage = $state(false);

	// Sync pagination state with URL (1-indexed)
	$effect(() => {
		if (isUpdatingAccountsPage) return;
		accountsPage = data.accountsPagination.page;
	});

	$effect(() => {
		if (isUpdatingGoalsPage) return;
		goalsPage = data.goalsPagination.page;
	});

	$effect(() => {
		if (isUpdatingAccountsPage) return;
		const urlAccountsPage = Number(pageState.url.searchParams.get('accountsPage')) || 1;
		if (accountsPage !== urlAccountsPage - 1) accountsPage = urlAccountsPage - 1;
	});

	$effect(() => {
		if (isUpdatingGoalsPage) return;
		const urlGoalsPage = Number(pageState.url.searchParams.get('goalsPage')) || 1;
		if (goalsPage !== urlGoalsPage - 1) goalsPage = urlGoalsPage - 1;
	});

	// Handle page changes
	async function updateAccountsPage(newPage: number) {
		if (isUpdatingAccountsPage) return;
		isUpdatingAccountsPage = true;
		accountsPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('accountsPage', String(newPage + 1));
		} else {
			url.searchParams.delete('accountsPage');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingAccountsPage = false;
	}

	async function updateGoalsPage(newPage: number) {
		if (isUpdatingGoalsPage) return;
		isUpdatingGoalsPage = true;
		goalsPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('goalsPage', String(newPage + 1));
		} else {
			url.searchParams.delete('goalsPage');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingGoalsPage = false;
	}

	// Current tax year slug for interest link
	const currentYearSlug = $derived(
		data.interestSummary
			? new Date(data.interestSummary.taxYearStart).getUTCFullYear() + '-' +
			  String(new Date(data.interestSummary.taxYearEnd).getUTCFullYear()).slice(-2)
			: ''
	);

	// Group accounts by type for the overview.
	// Each account's balance is split by sign: positive balances sit under Assets,
	// negative balances sit under Liabilities — even if the account category is 'asset'.
	// This means a type like "Investments" can appear in BOTH sections simultaneously.
	const accountsByType = $derived.by(() => {
		// Key: `${type}:asset` or `${type}:liability`
		const typeMap = new Map<string, {
			type: string;
			count: number;
			balance: number;
			lastUpdated: Date | null;
			excluded: boolean;
			displayCategory: 'asset' | 'liability';
		}>();

		for (const account of data.accounts) {
			if (account.closedAt) continue;

			const balance = account.currentBalance ?? 0;
			if (balance === 0) continue; // skip zero-balance accounts
			const updatedAt = account.lastUpdated ?? null;

			// Decide which section this account's balance belongs to
			const displayCategory: 'asset' | 'liability' =
				account.category === 'liability' || balance < 0 ? 'liability' : 'asset';

			const key = `${account.type}:${displayCategory}`;
			const existing = typeMap.get(key);

			if (existing) {
				existing.count++;
				existing.balance += balance;
				if (updatedAt && (!existing.lastUpdated || updatedAt > existing.lastUpdated)) {
					existing.lastUpdated = updatedAt;
				}
				if (!account.excludedFromNetWorth) existing.excluded = false;
			} else {
				typeMap.set(key, {
					type: account.type,
					count: 1,
					balance,
					lastUpdated: updatedAt,
					excluded: account.excludedFromNetWorth,
					displayCategory
				});
			}
		}

		return Array.from(typeMap.values());
	});

	const assetGroups = $derived(accountsByType.filter(g => g.displayCategory === 'asset'));
	const liabilityGroups = $derived(accountsByType.filter(g => g.displayCategory === 'liability'));
	const activeAccountCount = $derived(data.accounts.filter(a => !a.closedAt).length);

	// Accounts hard cap (8 combined rows)
	const ACCOUNTS_CAP = 8;
	const cappedAssetGroups = $derived(assetGroups.slice(0, ACCOUNTS_CAP));
	const cappedLiabilityGroups = $derived(liabilityGroups.slice(0, Math.max(0, ACCOUNTS_CAP - assetGroups.length)));
	const hiddenAccountGroupsCount = $derived(Math.max(0, (assetGroups.length + liabilityGroups.length) - ACCOUNTS_CAP));
</script>

{#if !user}
	<!-- Logged out state - terminal style welcome -->
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-2 mt-0">
			OFFLINE FINANCE DASHBOARD
		</h1>
		<p class="text-gray-600 my-1">
			Your trustworthy net worth at a glance.
		</p>
	</div>

	<div class="border-b border-black p-2">
		<div class="mb-2">
			<a href="/register" class="bracket-link">Create Account</a>
			<a href="/login" class="bracket-link">Log In</a>
			{#if env?.mode === 'development'}
				<a href="/dev-login" class="bracket-link text-amber-700 font-bold">Dev Auto-Login</a>
			{/if}
		</div>
	</div>

	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">SECURITY FEATURES</div>
	<div class="border-b border-black p-2">
		<div class="flex justify-between my-1"><span>End-to-end encryption</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>TOTP authentication</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Argon2id hashing</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Row-level security</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Offline-first</span><span class="text-green-700 font-bold">Active</span></div>
	</div>
{:else}
	<!-- Net worth display with server-side data -->
	<NetWorthDisplay
		netWorth={data.netWorth}
		totalAssets={data.totalAssets}
		totalLiabilities={data.totalLiabilities}
		excludedAssets={data.excludedAssets}
		excludedLiabilities={data.excludedLiabilities}
		dateRange={data.dateRange}
		hasStaleData={data.hasStaleData}
		exclusionCount={data.exclusionCount}
		accounts={data.accounts}
	/>

	<TaxYearProgress data={data.isaTracker} />

	<IsaAllowanceWidget data={data.isaTracker} />

	<!-- INTEREST SUMMARY SECTION -->
	{#if data.interestSummary}
	{@const posted = data.interestSummary.actualInterestIsa + data.interestSummary.actualInterestNonIsa}
	{@const estimated = data.interestSummary.projectedInterestIsa + data.interestSummary.projectedInterestNonIsa}
	{@const forecast = posted + estimated}
	<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
		<span>INTEREST</span>
		<div class="flex items-center gap-2">
			<a href="/accounts/interest/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
		</div>
	</div>
	<div class="border-b border-black">
		<div class="grid grid-cols-2 md:grid-cols-4">
			<div class="border-r border-black p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Posted (Actual)</div>
				<div class="text-lg font-bold text-green-700">{formatCurrency(posted)}</div>
			</div>
			<div class="border-r border-black p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Estimated (Projected)</div>
				<div class="text-lg font-bold text-amber-700">{formatCurrency(estimated)}</div>
			</div>
			<div class="border-r border-black p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">Forecast (Total)</div>
				<div class="text-lg font-bold">{formatCurrency(forecast)}</div>
			</div>
			<div class="p-2">
				<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">PSA Remaining</div>
				{#if data.interestSummary.taxFreeStatusProjected.overAllowance}
					<div class="text-sm font-bold text-red-700">Over</div>
				{:else}
					<div class="text-sm font-bold text-green-700">{formatCurrency(data.interestSummary.taxFreeStatusProjected.remaining)}</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Accordion: Interest Explanation -->
	<div class="border-b border-black">
		<button
			type="button"
			class="w-full p-2 text-left font-bold flex justify-between items-center hover:bg-gray-50"
			onclick={() => interestExpanded = !interestExpanded}
		>
			<span class="text-xs uppercase">{interestExpanded ? '[-] Collapse' : '[+] Expand'}</span>
		</button>
		{#if interestExpanded}
			<div class="p-2 border-t border-black text-xs text-gray-700 space-y-2">
				<div>
					<span class="font-bold">Posted (Actual):</span> Interest transactions already received this tax year.
				</div>
				<div>
					<span class="font-bold">Estimated (Projected):</span> Projected interest based on current balances and rates for the remaining {data.interestSummary.daysRemainingInTaxYear} days.
				</div>
				<div>
					<span class="font-bold">ISA/LISA:</span> Always tax-free. Current total: {formatCurrency(data.interestSummary.totalExpectedIsa)}
				</div>
				<div>
					<span class="font-bold">Personal Savings Allowance:</span> 
					{#if data.interestSummary.taxFreeStatusProjected.overAllowance}
						Over by {formatCurrency(data.interestSummary.taxFreeStatusProjected.taxableAmount)} of {formatCurrency(data.interestSummary.taxFreeStatusProjected.allowance)} allowance ({data.interestSummary.taxBand} rate).
					{:else}
						{formatCurrency(data.interestSummary.taxFreeStatusProjected.remaining)} remaining of {formatCurrency(data.interestSummary.taxFreeStatusProjected.allowance)} allowance ({data.interestSummary.taxBand} rate).
					{/if}
				</div>
			</div>
		{/if}
	</div>
	{/if}

	<!-- ACCOUNTS BY TYPE -->
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
		<div class="flex items-center gap-2">
			<span>ACCOUNTS ({activeAccountCount})</span>
			<span class="text-xs font-bold text-gray-500">{data.staleness.label}</span>
		</div>
		<a href="/accounts" class="bracket-link text-xs">View All</a>
	</div>
	<div class="p-0">
		<table>
			<thead>
				<tr>
					<th class="w-8 text-center border-r border-gray-200">[#]</th>
					<th class="pl-2 text-left">Type</th>
					<th class="text-left pl-2">Balance</th>
					<th class="text-right pr-1">Updated</th>
				</tr>
			</thead>
			<tbody>
				{#if assetGroups.length > 0}
					<tr class="bg-gray-50">
						<td colspan="4" class="pl-1 text-xs font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200 py-2">Assets</td>
					</tr>
					{#each cappedAssetGroups as group}
						<tr class:line-through={group.excluded} class:text-gray-500={group.excluded}>
							<td class="text-center tabular-nums border-r border-gray-200 text-gray-400 text-xs py-2">
								{group.count}
							</td>
							<td class="pl-2 py-2">
								<a href="/accounts?type={group.type}" class="bracket-link">
									{formatAccountType(group.type)}
								</a>
							</td>
							<td class="text-left pl-2 tabular-nums py-2">
								{formatCurrency(group.balance)}
							</td>
							<td class="text-right pr-1 tabular-nums py-2">
								{formatDateShorthand(group.lastUpdated)}
							</td>
						</tr>
					{/each}
				{/if}
				{#if liabilityGroups.length > 0}
					<tr class="bg-gray-50">
						<td colspan="4" class="pl-1 text-xs font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200 py-2">Liabilities</td>
					</tr>
					{#each cappedLiabilityGroups as group}
						<tr class:line-through={group.excluded} class:text-gray-500={group.excluded}>
							<td class="text-center tabular-nums border-r border-gray-200 text-gray-400 text-xs py-2">
								{group.count}
							</td>
							<td class="pl-2 py-2">
								<a href="/accounts?type={group.type}" class="bracket-link">
									{formatAccountType(group.type)}
								</a>
							</td>
							<td class="text-left pl-2 tabular-nums py-2">
								{formatCurrency(Math.abs(group.balance))}
							</td>
							<td class="text-right pr-1 tabular-nums py-2">
								{formatDateShorthand(group.lastUpdated)}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
		{#if hiddenAccountGroupsCount > 0}
			<div class="border-t border-black p-2 text-xs text-gray-500">
				... and {hiddenAccountGroupsCount} more — <a href="/accounts" class="bracket-link">View All</a>
			</div>
		{/if}
	</div>

	<AlertsSection
		alerts={data.alerts}
		title="ALERTS"
		maxItems={5}
		viewAllHref="/alerts"
	/>

	<!-- GOALS PREVIEW -->
	{#if goals && goals.length > 0}
	<div bind:this={goalsSectionRef}>
		<div class="font-bold flex justify-between bg-gray-100 border-y border-black p-2">
			<div class="flex items-center gap-2">
				<span>GOALS ({goals.length})</span>
				<span class="text-xs font-bold text-gray-500">{data.staleness.label}</span>
			</div>
			<a href="/goals" class="bracket-link text-xs">View All</a>
		</div>
		<div>
			{#each goals as goal}
				<div class="p-2 border-b border-black last:border-0 mb-2 last:mb-0">
					<GoalCard {goal} />
				</div>
			{/each}
		</div>
		<PaginationClient
      page={goalsPage}
      totalPages={data.goalsPagination.totalPages}
      onPageChange={updateGoalsPage}
      scrollTarget={goalsSectionRef}
    />
	</div>
	{/if}
{/if}
