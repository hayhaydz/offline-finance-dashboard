<script lang="ts">
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import { formatCurrency, formatCurrencyShorthand, formatAccountType, formatDate } from '$lib/utils/currency';

	let { data } = $props();
	let { user, environment: env, goals } = $derived(data);

	// Group accounts by type for the overview
	const accountsByType = $derived.by(() => {
		const typeMap = new Map<string, { 
			count: number; 
			balance: number; 
			lastUpdated: Date | null; 
			excluded: boolean;
			category: 'asset' | 'liability';
		}>();

		for (const account of data.accounts) {
			if (account.closedAt) continue;

			const existing = typeMap.get(account.type);
			const latestBalance = account.balances[0];
			const balance = latestBalance?.balanceInCents || 0;
			const updatedAt = latestBalance?.asOfDate || null;

			if (existing) {
				existing.count++;
				existing.balance += balance;
				if (updatedAt && (!existing.lastUpdated || updatedAt > existing.lastUpdated)) {
					existing.lastUpdated = updatedAt;
				}
				// Type is excluded if ALL accounts of this type are excluded
				if (!account.excludedFromNetWorth) {
					existing.excluded = false;
				}
			} else {
				typeMap.set(account.type, {
					count: 1,
					balance,
					lastUpdated: updatedAt,
					excluded: account.excludedFromNetWorth,
					category: account.category
				});
			}
		}

		return Array.from(typeMap.entries()).map(([type, stats]) => ({
			type,
			...stats
		}));
	});

	const assetGroups = $derived(accountsByType.filter(g => g.category === 'asset'));
	const liabilityGroups = $derived(accountsByType.filter(g => g.category === 'liability'));
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
				<a href="/dev-login" class="bracket-link text-amber-700 font-bold">[Dev Auto-Login]</a>
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

	<!-- GOALS PREVIEW -->
	{#if goals && goals.length > 0}
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<div class="flex items-center gap-2">
				<span><span class={data.staleness.cssClass}>●</span> GOALS</span>
				<span class="text-xs text-gray-500 font-normal">{data.staleness.label}</span>
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
	{/if}

	<!-- ACCOUNTS BY TYPE -->
	<div class="font-bold flex justify-between bg-gray-100 border-t border-b border-black p-2">
		<span>ACCOUNTS BY TYPE</span>
		<a href="/accounts" class="bracket-link text-xs">[View All]</a>
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
						<td colspan="4" class="pl-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200 py-2">Assets</td>
					</tr>
					{#each assetGroups as group}
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
								{formatDate(group.lastUpdated)}
							</td>
						</tr>
					{/each}
				{/if}
				{#if liabilityGroups.length > 0}
					<tr class="bg-gray-50">
						<td colspan="4" class="pl-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200 py-2">Liabilities</td>
					</tr>
					{#each liabilityGroups as group}
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
								{formatDate(group.lastUpdated)}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
{/if}
