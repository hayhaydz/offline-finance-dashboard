<script lang="ts">
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import { formatCurrency, formatCurrencyShorthand, formatAccountType, formatDateShorthand } from '$lib/utils/currency';

	let { data } = $props();
	let { user, environment: env, goals } = $derived(data);

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

			const latestBalance = account.balances[0];
			if (!latestBalance || latestBalance.balanceInCents === 0) continue; // skip accounts with no balance entries or zero balance
			const balance = latestBalance?.balanceInCents ?? 0;
			const updatedAt = latestBalance?.asOfDate ?? null;

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

	// Goals client-side pagination
	const GOALS_PER_PAGE = 5;
	let goalPage = $state(0);
	const goalTotalPages = $derived(Math.ceil((goals?.length ?? 0) / GOALS_PER_PAGE));
	const pagedGoals = $derived(goals?.slice(goalPage * GOALS_PER_PAGE, (goalPage + 1) * GOALS_PER_PAGE) ?? []);
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
								<a href="/accounts?type={group.type}" class="hover:underline">
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
								<a href="/accounts?type={group.type}" class="hover:underline">
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

	<!-- GOALS PREVIEW -->
	{#if goals && goals.length > 0}
		<div class="font-bold flex justify-between bg-gray-100 border-y border-black p-2">
			<div class="flex items-center gap-2">
				<span>GOALS ({goals.length})</span>
				<span class="text-xs font-bold text-gray-500">{data.staleness.label}</span>
			</div>
			<a href="/goals" class="bracket-link text-xs">View All</a>
		</div>
		<div>
			{#each pagedGoals as goal}
				<div class="p-2 border-b border-black last:border-0 mb-2 last:mb-0">
					<GoalCard {goal} />
				</div>
			{/each}
		</div>
		<PaginationClient bind:page={goalPage} totalPages={goalTotalPages} />
	{/if}
{/if}
