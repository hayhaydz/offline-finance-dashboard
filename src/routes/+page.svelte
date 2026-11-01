<script lang="ts">
	import AlertsSection from '$lib/components/AlertsSection.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import NetWorthDisplay from '$lib/components/NetWorthDisplay.svelte';
	import TaxYearTimeline from '$lib/components/TaxYearTimeline.svelte';
	import CashflowCalendar from '$lib/components/charts/CashflowCalendar.svelte';
	import TrendsMonthCompare from '$lib/components/charts/TrendsMonthCompare.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import DebtCard from '$lib/components/DebtCard.svelte';
	import HomeVizGallery from '$lib/components/charts/HomeVizGallery.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import { formatCurrency, formatCurrencyShorthand, formatAccountType, formatDateShorthand } from '$lib/utils/currency';

	let { data } = $props();
	let { user, environment: env, goals } = $derived(data);

	// Accordion state for interest section
	let interestExpanded = $state(false);

	// Goals preview filter (v3.1 A02: home shows a capped preview — /goals
	// owns pagination; no URL pagination wiring here anymore)
	let goalsFilter = $state<'all' | 'savings' | 'debt'>('all');

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
	const activeAccountCount = $derived(data.accounts.length);

	// Accounts hard cap (8 combined rows)
	const ACCOUNTS_CAP = 8;
	const cappedAssetGroups = $derived(assetGroups.slice(0, ACCOUNTS_CAP));
	const cappedLiabilityGroups = $derived(liabilityGroups.slice(0, Math.max(0, ACCOUNTS_CAP - assetGroups.length)));
	const hiddenAccountGroupsCount = $derived(Math.max(0, (assetGroups.length + liabilityGroups.length) - ACCOUNTS_CAP));

	const filteredGoals = $derived.by(() => {
		if (goalsFilter === 'all') return goals;
		if (goalsFilter === 'savings') return goals.filter((g) => g.goalType !== 'debt');
		return goals.filter((g) => g.goalType === 'debt');
	});
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

	<SectionHeader title="SECURITY FEATURES" />
	<div class="border-b border-black p-2">
		<div class="flex justify-between my-1"><span>End-to-end encryption</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Argon2id hashing</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Row-level security</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Offline-first</span><span class="text-green-700 font-bold">Active</span></div>
	</div>
{:else}
	<!-- v3 R3: header reverted to pre-v2 form — the trend chart moved into
	     the visualisation gallery below (HomeVizGallery). v3.1 border
	     system: hero is a boxed panel in the shared inset frame -->
	<div class="p-2">
		<NetWorthDisplay
			summary={data.netWorthSummary}
			accounts={data.accounts}
		/>
	</div>

	<!-- v3.1 border system: the tax strip panel sits in the same inset frame -->
	<div class="p-2">
		<TaxYearTimeline data={data.isaTracker} />
	</div>

	<!-- v3 R29: ACCOUNTS + GOALS side-by-side (3/2 split) -->
	<div class="grid grid-cols-5 gap-2 p-2">
	<div class={goals && goals.length > 0 ? 'col-span-3 border border-black [&>*:last-child]:border-b-0' : 'col-span-5 border border-black [&>*:last-child]:border-b-0'}>
	<!-- ACCOUNTS BY TYPE -->
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
		<div class="flex items-center gap-2">
			<span>ACCOUNTS ({activeAccountCount})</span>
			{#if data.staleness}
				<span class="text-xs font-bold text-gray-500">{data.staleness.label}</span>
			{/if}
		</div>
		<a href="/accounts" class="bracket-link text-xs">View All</a>
	</div>
	<div class="p-0">
		<table>
			<thead>
				<tr>
					<th class="w-14 text-center border-r border-gray-200" title="Number of accounts of this type">Accts</th>
					<th class="pl-2 text-left">Type</th>
					<th class="text-right pr-2">Balance</th>
					<th class="text-right pr-1">Updated</th>
				</tr>
			</thead>
			<tbody>
				{#if assetGroups.length > 0}
					<tr class="bg-gray-50">
						<td colspan="4" class="pl-1 text-xs font-bold text-gray-500 uppercase tracking-wider border-y border-gray-200 py-2">Assets</td>
					</tr>
					{#each cappedAssetGroups as group}
						<tr class="hover:bg-gray-50 transition-colors duration-150 class:line-through={group.excluded} class:text-gray-500={group.excluded}">
							<td class="text-center tabular-nums border-r border-gray-200 text-gray-500 text-xs py-2">
								{group.count}
							</td>
							<td class="pl-2 py-2">
								<a href="/accounts?type={group.type}" class="bracket-link">
									{formatAccountType(group.type)}
								</a>
							</td>
						<td class="text-right pr-2 tabular-nums py-2">
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
						<tr class="hover:bg-gray-50 transition-colors duration-150 class:line-through={group.excluded} class:text-gray-500={group.excluded}">
							<td class="text-center tabular-nums border-r border-gray-200 text-gray-500 text-xs py-2">
								{group.count}
							</td>
							<td class="pl-2 py-2">
								<a href="/accounts?type={group.type}" class="bracket-link">
									{formatAccountType(group.type)}
								</a>
							</td>
						<td class="text-right pr-2 tabular-nums py-2">
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
	</div>

	<!-- GOALS PREVIEW -->
	{#if goals && goals.length > 0}
	<div class="col-span-2 border border-black [&>*:last-child]:border-b-0">
	<div>
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<div class="flex items-center gap-2">
				<span>GOALS ({goalsFilter === 'all' ? goals.length : filteredGoals.length})</span>
				<div class="flex gap-1">
					<button
						type="button"
						onclick={() => goalsFilter = 'all'}
						class="bracket-link text-xs font-bold cursor-pointer"
						class:text-green-700={goalsFilter === 'all'}
					>All</button>
					<button
						type="button"
						onclick={() => goalsFilter = 'savings'}
						class="bracket-link text-xs font-bold cursor-pointer"
						class:text-green-700={goalsFilter === 'savings'}
					>Savings</button>
					<button
						type="button"
						onclick={() => goalsFilter = 'debt'}
						class="bracket-link text-xs font-bold cursor-pointer"
						class:text-green-700={goalsFilter === 'debt'}
					>Debt</button>
				</div>
			</div>
			<a href="/goals" class="bracket-link text-xs">View All</a>
		</div>
		<div>
			{#if filteredGoals.length === 0}
				<p class="text-gray-600 text-xs p-2">
					No {goalsFilter} goals.
				</p>
			{:else}
				<!-- v3.1 A12 flagship metric: cap the home preview at 3 cards —
				     10 cards (1058px) stretched the neighbouring ACCOUNTS cell to
				     27% content-fill (D2 pairing violation). Full list lives on /goals. -->
				{#each filteredGoals.slice(0, 3) as goal}
					<div class="p-2 border-b border-black last:border-0">
						{#if goal.goalType === 'debt' && goal.progress}
							<DebtCard
								name={goal.name}
								slug={goal.slug}
								paidInCents={goal.progress.paidInCents}
								remainingInCents={goal.progress.remainingInCents}
								percent={goal.progress.percent}
								projectedPayoffDate={goal.projectedPayoffDate}
								updatedAt={goal.updatedAt}
							/>
						{:else}
							<GoalCard {goal} />
						{/if}
					</div>
				{/each}
				{#if filteredGoals.length > 3}
					<a href="/goals" class="bracket-link text-xs block p-2 border-t border-black bg-gray-50">
						+ {filteredGoals.length - 3} more goal{filteredGoals.length - 3 === 1 ? '' : 's'} — view all
					</a>
				{/if}
			{/if}
		</div>
		<!-- v3.1 A02 design-quality: no 3-at-a-time pagination on home — the
		     "+N more — view all" link is the single nav model; /goals owns
		     full pagination. -->
	</div>
	</div>
	{/if}
	</div>

	{#if data.trends}
	<!-- v3.2 V6 (2026-11-01): homepage TRENDS section — Monzo-style headline +
	     this-month-vs-last-month cumulative graph + insights link. Statement
	     model (D0): "spent so far" = the current statement month as declared;
	     if nothing is declared yet the section says so instead of faking £0. -->
	<div class="p-2">
		<div class="border border-black">
			<div class="flex justify-between items-baseline bg-gray-100 border-b border-black px-2 py-1.5">
				<span class="text-sm font-bold">TRENDS</span>
				<span class="text-sm font-bold tabular-nums">
					{data.trends.currentMonthDeclared
						? formatCurrency(data.trends.current.totalPence)
						: '—'}
					<span class="text-gray-600 font-normal"> - spent so far - </span>
					{data.trends.accountCount} account{data.trends.accountCount === 1 ? '' : 's'}
				</span>
			</div>
			<div class="px-2 pt-1 text-[10px] text-gray-600">
				{#if data.trends.currentMonthDeclared}
					{data.trends.currentMonthKey} as declared from statements · {data.trends.previousMonthKey} comparison · not realtime
				{:else}
					{data.trends.currentMonthKey} not declared yet — it enters at statement time · showing the {data.trends.previousMonthKey} comparison shape
				{/if}
			</div>
			<TrendsMonthCompare
				currentMonthKey={data.trends.currentMonthKey}
				previousMonthKey={data.trends.previousMonthKey}
				currentDaily={data.trends.current.daily}
				previousDaily={data.trends.previous.daily}
			/>
			<a
				href="/overview/trends/insights"
				class="bracket-link text-xs block border-t border-black px-2 py-1.5 bg-gray-50 hover:bg-gray-100"
			>
				view your spending insights
			</a>
		</div>
	</div>
	{/if}

	<!-- v3 R3: visualisation gallery — bento grid of compact cells -->
	<HomeVizGallery
		trend={data.netWorthTrend}
		assetGroups={assetGroups.map(g => ({ name: g.type, value: Math.max(0, g.balance) }))}
	/>

	<!-- v3 R29: INTEREST + ALERTS side-by-side (3/2 split). v3.1 border
	     system: cells own complete boxes; the wrapper carries NO border-b
	     (wrapper+cell borders drew parallel rules 8px apart) -->
	<div class="grid grid-cols-5 gap-2 p-2">
	<!-- INTEREST SUMMARY SECTION -->
	{#if data.interestSummary}
	{@const posted = data.interestSummary.actualInterestIsa + data.interestSummary.actualInterestNonIsa}
	{@const estimated = data.interestSummary.projectedInterestIsa + data.interestSummary.projectedInterestNonIsa}
	{@const forecast = posted + estimated}
	{@const isaPosted = data.interestSummary.actualInterestIsa}
	{@const isaProjected = data.interestSummary.projectedInterestIsa}
	{@const taxablePosted = data.interestSummary.actualInterestNonIsa}
	{@const taxableProjected = data.interestSummary.projectedInterestNonIsa}
	{#snippet interestAction()}
		<div class="flex items-center gap-2">
			<a href="/accounts/interest/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
			<button
				type="button"
				class="bracket-link text-xs cursor-pointer"
				aria-expanded={interestExpanded}
				onclick={() => interestExpanded = !interestExpanded}
			>
				{interestExpanded ? '− Explain' : '+ Explain'}
			</button>
		</div>
	{/snippet}
	<div class="col-span-3 border border-black [&>*:last-child]:border-b-0">
	<SectionHeader title="INTEREST" action={interestAction} />
	<div class="border-b border-black">
		<div class="grid grid-cols-2 md:grid-cols-4">
			<KpiCard label="Posted (Actual)" value={formatCurrency(posted)} color="text-green-700" />
			<KpiCard label="Estimated (Projected)" value={formatCurrency(estimated)} color="text-amber-700" />
			<KpiCard label="Forecast (Total)" value={formatCurrency(forecast)} />
			<KpiCard
				label="PSA Remaining"
				value={data.interestSummary.taxFreeStatusProjected.overAllowance
					? `−${formatCurrency(data.interestSummary.taxFreeStatusProjected.taxableAmount)}`
					: formatCurrency(data.interestSummary.taxFreeStatusProjected.remaining)}
				color={data.interestSummary.taxFreeStatusProjected.overAllowance ? 'text-red-700' : 'text-green-700'}
				detail="{data.interestSummary.taxFreeStatusProjected.overAllowance ? `over the ${formatCurrency(data.interestSummary.taxFreeStatusProjected.allowance)} allowance` : `of ${formatCurrency(data.interestSummary.taxFreeStatusProjected.allowance)} allowance`} · {data.interestSummary.taxBand} rate"
			/>
		</div>
	</div>

	<!-- v3.1 A02 D2/D8: wrapper split — the PSA story is ISA-vs-taxable;
	     this ledger fills the stretched cell with data that belongs here -->
	<div class="border-t border-gray-200 text-xs">
		<div class="grid grid-cols-[1fr_repeat(3,minmax(0,9rem))] bg-gray-50 border-b border-gray-200">
			<div class="pl-2 py-1 text-[10px] font-bold text-gray-600 uppercase">Wrapper</div>
			<div class="py-1 text-right text-[10px] font-bold text-gray-600 uppercase">Posted</div>
			<div class="py-1 text-right text-[10px] font-bold text-gray-600 uppercase">Projected</div>
			<div class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Forecast</div>
		</div>
		<div class="grid grid-cols-[1fr_repeat(3,minmax(0,9rem))] border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
			<div class="pl-2 py-1.5">ISA / LISA <span class="text-gray-500">tax-free</span></div>
			<div class="py-1.5 text-right tabular-nums">{formatCurrency(isaPosted)}</div>
			<div class="py-1.5 text-right tabular-nums text-gray-600">{formatCurrency(isaProjected)}</div>
			<div class="py-1.5 pr-2 text-right tabular-nums font-bold">{formatCurrency(isaPosted + isaProjected)}</div>
		</div>
		<div class="grid grid-cols-[1fr_repeat(3,minmax(0,9rem))] border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
			<div class="pl-2 py-1.5">Taxable <span class="text-gray-500">counts towards PSA</span></div>
			<div class="py-1.5 text-right tabular-nums">{formatCurrency(taxablePosted)}</div>
			<div class="py-1.5 text-right tabular-nums text-gray-600">{formatCurrency(taxableProjected)}</div>
			<div class="py-1.5 pr-2 text-right tabular-nums font-bold">{formatCurrency(taxablePosted + taxableProjected)}</div>
		</div>
	</div>

	<!-- Accordion: Interest Explanation (v3.1 A02: toggle lives in the header
	     action area — the full-width expand row was a dead row) -->
	<div>
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
	</div>
	{/if}

	<div class={data.interestSummary ? 'col-span-2 border border-black [&>*:last-child]:border-b-0' : 'col-span-5 border border-black [&>*:last-child]:border-b-0'}>
	<AlertsSection
		alerts={data.alerts}
		title="ALERTS"
		maxItems={5}
		viewAllHref="/alerts"
	/>
	</div>
	</div>

	<!-- v3.2 V2 (2026-11-01): the cashflow calendar moves to the BOTTOM of
	     home (user direction) — accounts+goals moved to the top; the viz
	     gallery above keeps the trend+allocation pair. Full-width cell: the
	     month grid was already col-span-3 in the gallery, so nothing shrinks. -->
	{#if data.cashflow && data.cashflow.obligations.length > 0}
		<div class="p-2">
			<CashflowCalendar
				year={data.cashflow.year}
				month={data.cashflow.month}
				obligations={data.cashflow.obligations}
			/>
		</div>
	{/if}
{/if}
