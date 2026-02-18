<script lang="ts">
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
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

	// Goals preview helpers
	function calculateProgress(current: number, target: number): number {
		return target > 0 ? Math.round((current / target) * 100) : 0;
	}

	function getProgressColorClass(progress: number): string {
		if (progress >= 70) return 'green';
		if (progress >= 30) return 'amber';
		return 'red';
	}

	// Emergency Fund milestones (1mo = 8.33%, 3mo = 25%, 6mo = 50%, 12mo = 100%)
	function getEmergencyFundMilestones(target: number) {
		return [
			{ label: '1mo', percent: 8.33 },
			{ label: '3mo', percent: 25 },
			{ label: '6mo', percent: 50 },
			{ label: '12mo', percent: 100 }
		];
	}
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
				<span><span class="text-green-700">●</span> GOALS</span>
				<span class="text-xs text-gray-500 font-normal">Last updated: Today</span>
			</div>
			<a href="/goals" class="bracket-link text-xs">View All</a>
		</div>
		<div class="p-2">
			{#each goals as goal}
				{@const progress = calculateProgress(goal.currentAllocation, goal.targetAmountInCents)}
				{@const progressColor = getProgressColorClass(progress)}
				<div class="border border-black p-2 mb-2 last:mb-0">
					<div class="flex justify-between items-center mb-1">
						<span class="font-bold text-sm">
							{goal.name}
							{#if goal.isEmergencyFund}
								<span class="text-[10px] text-gray-500 font-normal ml-1">
									[
									<span class="text-green-700">1mo</span>
									<span class="text-green-700">3mo</span>
									<span class="text-green-700">6mo</span>
									<span class="text-gray-400">12mo</span>
								]
							</span>
						{/if}
						</span>
					</div>

					<!-- Progress bar (ASSET_CONTAINER style) -->
					<div class="flex items-center gap-2 text-sm leading-none font-bold {progressColor === 'green' ? 'text-green-700' : progressColor === 'amber' ? 'text-amber-600' : 'text-red-600'} mb-1">
						<span>[</span>
						<div class="flex-1 h-5 relative mt-px border-y border-gray-100">
							<div class="absolute inset-0 flex justify-between opacity-20">
								{#each Array(40) as _} <div class="w-[1px] h-full bg-current"></div> {/each}
							</div>
							<div class="h-full {progressColor === 'green' ? 'bg-green-700' : progressColor === 'amber' ? 'bg-amber-600' : 'bg-red-600'} transition-all duration-300 mix-blend-multiply" style="width: {progress}%"></div>
						</div>
						<span>]</span>
						<span class="text-xs text-gray-500 min-w-[30px] text-right font-normal">{progress}%</span>
					</div>

					<div class="flex justify-between text-xs mb-1">
						<span>{formatCurrencyShorthand(goal.currentAllocation)} of {formatCurrencyShorthand(goal.targetAmountInCents)}</span>
						<span class="font-bold {progressColor === 'green' ? 'text-green-700' : progressColor === 'amber' ? 'text-amber-600' : 'text-red-600'}">
							Remaining: {formatCurrencyShorthand(goal.targetAmountInCents - goal.currentAllocation)}
						</span>
					</div>

					<div class="flex gap-2 mt-2">
						<a href="/goals/{goal.slug}/add" class="bracket-link text-xs">[Add Money]</a>
						<a href="/goals/{goal.slug}/withdraw" class="bracket-link text-xs">[Withdraw]</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ACCOUNTS BY TYPE -->
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">ACCOUNTS BY TYPE</div>
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
						<td colspan="4" class="pl-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200">Assets</td>
					</tr>
					{#each assetGroups as group}
						<tr class:line-through={group.excluded} class:text-gray-500={group.excluded}>
							<td class="text-center tabular-nums border-r border-gray-200 text-gray-400 text-xs">
								{group.count}
							</td>
							<td class="pl-2">
								<a href="/accounts?type={group.type}" class="hover:underline">
									{formatAccountType(group.type)}
								</a>
							</td>
							<td class="text-left pl-2 tabular-nums">
								{formatCurrency(group.balance)}
							</td>
							<td class="text-right pr-1 tabular-nums">
								{formatDate(group.lastUpdated)}
							</td>
						</tr>
					{/each}
				{/if}
				{#if liabilityGroups.length > 0}
					<tr class="bg-gray-50">
						<td colspan="4" class="pl-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200">Liabilities</td>
					</tr>
					{#each liabilityGroups as group}
						<tr class:line-through={group.excluded} class:text-gray-500={group.excluded}>
							<td class="text-center tabular-nums border-r border-gray-200 text-gray-400 text-xs">
								{group.count}
							</td>
							<td class="pl-2">
								<a href="/accounts?type={group.type}" class="hover:underline">
									{formatAccountType(group.type)}
								</a>
							</td>
							<td class="text-left pl-2 tabular-nums">
								{formatCurrency(Math.abs(group.balance))}
							</td>
							<td class="text-right pr-1 tabular-nums">
								{formatDate(group.lastUpdated)}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
		<div class="px-2 py-1">
			<a href="/accounts" class="bracket-link">View All Accounts</a>
		</div>
	</div>
{/if}
