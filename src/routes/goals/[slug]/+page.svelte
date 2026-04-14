<script lang="ts">
  import { goto } from '$app/navigation';
  import { page as pageState } from '$app/state';
  import { formatCurrency, formatDateShorthand, formatAccountType } from "$lib/utils/currency";
  import { formatDays, getOnTrackClass, formatTaxWrapper } from "$lib/utils/formatting";
  import { getStaleness } from "$lib/utils/staleness";
  import { DISPLAY_LIMITS, truncateDisplay } from "$lib/utils/fieldLimits";
  import GoalDetailCard from "$lib/components/GoalDetailCard.svelte";
  import PaginationClient from "$lib/components/PaginationClient.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Debt-specific interactive state
  let monthlyPayment = $state(data.debtData?.defaultMonthlyPayment ?? 0);

  // Client-side payoff projection (inline formula, no server imports)
  const projection = $derived(() => {
    if (!data.debtData) return null;
    const balance = Math.abs(data.debtData.linkedAccount.currentBalance);
    const apr = data.debtData.linkedAccount.apr ?? 0;
    if (balance === 0) return { months: 0, payoffDate: null as Date | null };
    if (monthlyPayment <= 0) return null;
    const monthlyRate = (apr / 100) / 12 / 100;
    if (monthlyRate === 0) {
      const months = Math.ceil(balance / monthlyPayment);
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      return { months, payoffDate: d };
    }
    if (monthlyPayment <= balance * monthlyRate) return null;
    const months = Math.ceil(
      -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate)
    );
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return { months, payoffDate: d };
  });

  function formatMinimumPayment(account: { minimumPayment: number | null; minimumPaymentType: string | null }): string {
    if (!account.minimumPayment) return "-";
    return `£${(account.minimumPayment / 100).toFixed(2)}`;
  }

  let allocTableRef: HTMLElement | null = $state(null);
  let srcAccountsRef: HTMLElement | null = $state(null);
  let allocPage = $state(0);
  let srcPage = $state(0);
  let isUpdatingAllocPage = $state(false);
  let isUpdatingSrcPage = $state(false);

  async function updateAllocPage(newPage: number) {
    if (isUpdatingAllocPage) return;
    isUpdatingAllocPage = true;
    allocPage = newPage;
    const url = new URL(pageState.url);
    if (newPage + 1 !== 1) {
      url.searchParams.set('allocPage', String(newPage + 1));
    } else {
      url.searchParams.delete('allocPage');
    }
    await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
    isUpdatingAllocPage = false;
  }

  async function updateSrcPage(newPage: number) {
    if (isUpdatingSrcPage) return;
    isUpdatingSrcPage = true;
    srcPage = newPage;
    const url = new URL(pageState.url);
    if (newPage + 1 !== 1) {
      url.searchParams.set('srcPage', String(newPage + 1));
    } else {
      url.searchParams.delete('srcPage');
    }
    await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
    isUpdatingSrcPage = false;
  }

  $effect(() => {
    if (isUpdatingAllocPage) return;
    allocPage = data.allocPage;
  });

  $effect(() => {
    if (isUpdatingSrcPage) return;
    srcPage = data.srcPage;
  });

  $effect(() => {
    if (isUpdatingAllocPage) return;
    const urlPage = Number(pageState.url.searchParams.get('allocPage')) || 1;
    if (allocPage !== urlPage - 1) {
      allocPage = urlPage - 1;
    }
  });

  $effect(() => {
    if (isUpdatingSrcPage) return;
    const urlPage = Number(pageState.url.searchParams.get('srcPage')) || 1;
    if (srcPage !== urlPage - 1) {
      srcPage = urlPage - 1;
    }
  });

  const staleness = $derived(getStaleness(new Date(data.goal.updatedAt)));


  // Helper to format liquidity
  function formatLiquidity(liquidity: string | null): string {
    if (!liquidity) return "";
    const liquidityMap: Record<string, string> = {
      instant: "Instant",
      delayed: "Delayed",
      locked: "Locked",
    };
    return liquidityMap[liquidity] ?? liquidity;
  }

  // Calculate percentage of goal from each account
  const totalAllocated = $derived(
    data.accountAllocations.reduce((sum, a) => sum + a.netAllocated, 0)
  );
</script>

<!-- GOAL INFO HEADER -->
<div class="border-b border-black p-2">
  <div class="flex justify-between items-center gap-2">
    <h1 class="text-lg font-bold flex items-center gap-1 min-w-0 overflow-hidden">
      <span class="{staleness.cssClass} shrink-0">●</span>
      <span class="truncate">{truncateDisplay(data.goal.name, DISPLAY_LIMITS.GOAL_NAME)}</span>
    </h1>
    <a href="/goals" class="bracket-link text-xs shrink-0">Back to Goals</a>
  </div>
</div>

<!-- GOAL DETAILS -->
<div>
  <GoalDetailCard
    goal={{
      ...data.goal,
      goalType: data.goal.goalType,
      startingBalanceInCents: data.goal.startingBalanceInCents,
      linkedAccountSlug: data.debtData?.linkedAccount.slug ?? null,
      milestones: null,
    }}
    showArchive={true}
  />
</div>

<!-- ACCOUNT ALLOCATION BREAKDOWN -->
{#if data.goal.goalType !== 'debt' && data.accountAllocations.length > 0}
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      SOURCE ACCOUNTS ({data.srcTotalAccounts})
    </div>
    <table bind:this={srcAccountsRef}>
      <thead>
        <tr>
          <th class="pl-2 text-left">Account</th>
          <th class="text-right pr-1">Amount</th>
          <th class="text-right pr-1">%</th>
          <th class="text-right pr-1">Type</th>
          <th class="text-right pr-1">Tax</th>
          <th class="text-right pr-1">Access</th>
        </tr>
      </thead>
      <tbody>
        {#each data.accountAllocations as alloc}
          <tr class="border-b border-gray-200 last:border-0">
            <td class="pl-2 text-sm py-2">
              <a href="/accounts/{alloc.accountSlug}" class="bracket-link">
                {truncateDisplay(alloc.accountName, DISPLAY_LIMITS.ACCOUNT_NAME)}
              </a>
            </td>
            <td class="text-right pr-1 text-sm py-2">
              {formatCurrency(alloc.netAllocated)}
            </td>
            <td class="text-right pr-1 text-sm py-2 text-gray-600">
              {#if totalAllocated > 0}
                {((alloc.netAllocated / totalAllocated) * 100).toFixed(1)}%
              {:else}
                0%
              {/if}
            </td>
            <td class="text-right pr-1 text-sm py-2 text-gray-600">
              {formatAccountType(alloc.accountType)}
            </td>
            <td class="text-right pr-1 text-sm py-2">
              {#if alloc.taxWrapper && alloc.taxWrapper !== 'none'}
                <span class="text-amber-700">{formatTaxWrapper(alloc.taxWrapper)}</span>
              {:else}
                <span class="text-gray-400">-</span>
              {/if}
            </td>
            <td class="text-right pr-1 text-sm py-2 text-gray-600">
              {formatLiquidity(alloc.liquidity)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <PaginationClient
      page={srcPage}
      totalPages={data.srcTotalPages}
      onPageChange={updateSrcPage}
      scrollTarget={srcAccountsRef}
    />
  </div>
{:else if data.goal.currentAllocation > 0}
  <div class="border-t border-black p-2 text-xs text-gray-600">
    Allocation data missing — goal shows {formatCurrency(data.goal.currentAllocation)} but no source accounts found
  </div>
{/if}

<!-- LINKED DEBT ACCOUNT (debt goals only) -->
{#if data.goal.goalType === 'debt' && data.debtData}
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      LINKED DEBT ACCOUNT
    </div>
    <div class="p-2">
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span class="text-gray-600">Account:</span>
          <a href="/accounts/{data.debtData.linkedAccount.slug}" class="bracket-link ml-1">
            {data.debtData.linkedAccount.name}
          </a>
        </div>
        <div>
          <span class="text-gray-600">Type:</span>
          <span class="ml-1">{formatAccountType(data.debtData.linkedAccount.type)}</span>
        </div>
        <div>
          <span class="text-gray-600">Balance:</span>
          <span class="ml-1">{formatCurrency(data.debtData.linkedAccount.currentBalance)}</span>
        </div>
        <div>
          <span class="text-gray-600">APR:</span>
          <span class="ml-1">
            {data.debtData.linkedAccount.apr
              ? `${(data.debtData.linkedAccount.apr / 100).toFixed(2)}%`
              : "-"}
          </span>
        </div>
        <div>
          <span class="text-gray-600">Min Payment:</span>
          <span class="ml-1">{formatMinimumPayment(data.debtData.linkedAccount)}</span>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if data.goal.goalType === 'debt' && data.debtData}
  <!-- Debt Metrics -->
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      DEBT METRICS
    </div>
    <div class="grid grid-cols-3 divide-x divide-black">
      <div class="p-2">
        <div class="text-xs font-bold text-gray-600 mb-2">INTEREST</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-gray-600">APR:</span>
            <span>
              {data.debtData.linkedAccount.apr
                ? `${(data.debtData.linkedAccount.apr / 100).toFixed(2)}%`
                : "-"}
            </span>
          </div>
        </div>
      </div>
      <div class="p-2">
        <div class="text-xs font-bold text-gray-600 mb-2">MIN PAYMENT</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-gray-600">Amount:</span>
            <span>{formatMinimumPayment(data.debtData.linkedAccount)}</span>
          </div>
        </div>
      </div>
      <div class="p-2">
        <div class="text-xs font-bold text-gray-600 mb-2">PAYOFF PLAN</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between items-center gap-1">
            <span class="text-gray-600">Monthly:</span>
            <span class="font-bold">£{(monthlyPayment / 100).toFixed(0)}</span>
          </div>
          <input
            type="range"
            min="5000"
            max="100000"
            step="1000"
            bind:value={monthlyPayment}
            class="w-full"
          />
          {#if projection()}
            <div class="flex justify-between">
              <span class="text-gray-600">Months:</span>
              <span>{projection()?.months ?? "-"}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Target:</span>
              <span>{projection()?.payoffDate ? formatDateShorthand(projection()!.payoffDate!) : "-"}</span>
            </div>
          {:else}
            <div class="text-amber-600 text-xs mt-1">
              Payment too small to cover interest
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{:else}
  <!-- METRICS (savings goals) -->
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      METRICS
    </div>
    <div class="grid grid-cols-3 divide-x divide-black">
      <!-- Pace -->
      <div class="p-2">
        <div class="text-xs font-bold text-gray-600 mb-2">PACE</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-gray-600">Days left:</span>
            <span>{formatDays(data.paceMetrics.daysRemaining)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Remaining:</span>
            <span>{formatCurrency(data.paceMetrics.amountRemainingInCents)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Required/mo:</span>
            <span>
              {data.paceMetrics.requiredMonthlyInCents
                ? formatCurrency(data.paceMetrics.requiredMonthlyInCents)
                : "-"}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Actual/mo:</span>
            <span>
              {data.paceMetrics.actualMonthlyAvgInCents > 0
                ? formatCurrency(data.paceMetrics.actualMonthlyAvgInCents)
                : "-"}
            </span>
          </div>
          {#if data.paceMetrics.projectedCompletionDate}
            <div class="flex justify-between">
              <span class="text-gray-600">Projected:</span>
              <span class={getOnTrackClass(data.paceMetrics.onTrack)}>
                {formatDateShorthand(data.paceMetrics.projectedCompletionDate)}
              </span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Liquidity -->
      <div class="p-2">
        <div class="text-xs font-bold text-gray-600 mb-2">LIQUIDITY</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-gray-600">Instant:</span>
            <span>{data.liquidityBreakdown.instantPercent}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Delayed:</span>
            <span>{data.liquidityBreakdown.delayedPercent}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Locked:</span>
            <span>{data.liquidityBreakdown.lockedPercent}%</span>
          </div>
          {#if data.liquidityBreakdown.hasLiquidityWarning}
            <div class="mt-2 p-1 bg-amber-100 border border-amber-400 text-amber-800">
              {data.liquidityBreakdown.warningMessage}
            </div>
          {/if}
        </div>
      </div>

      <!-- Contributions -->
      <div class="p-2">
        <div class="text-xs font-bold text-gray-600 mb-2">CONTRIBUTIONS</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-gray-600">Last add:</span>
            <span>
              {data.contributionStats.daysSinceLastContribution !== null
                ? (data.contributionStats.daysSinceLastContribution === 0
                    ? "Today"
                    : formatDays(data.contributionStats.daysSinceLastContribution) + " ago")
                : "-"}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Total adds:</span>
            <span>{data.contributionStats.totalContributions}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Total withdraws:</span>
            <span>{data.contributionStats.totalWithdrawals}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if data.goal.goalType === 'debt' && data.debtData}
  <!-- Payoff History -->
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      PAYOFF HISTORY ({data.debtData.payoffHistory.length})
    </div>
    {#if data.debtData.payoffHistory.length === 0}
      <p class="text-gray-600 text-xs p-2">No payments yet.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th class="pl-2 text-left">Date</th>
            <th class="text-right pr-1">Type</th>
            <th class="text-right pr-1">Amount</th>
            <th class="text-right pr-1">Account</th>
          </tr>
        </thead>
        <tbody>
          {#each data.debtData.payoffHistory as history}
            <tr class="border-b border-gray-200 last:border-0">
              <td class="pl-2 text-sm py-2">
                {formatDateShorthand(new Date(history.transactionDate))}
              </td>
              <td class="text-right pr-1 text-sm py-2">
                {history.type}
              </td>
              <td class="text-right pr-1 text-sm py-2 text-amber-600">
                {formatCurrency(history.amount)}
              </td>
              <td class="text-right pr-1 text-sm py-2">
                {data.debtData.linkedAccount.name}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
{:else}
  <!-- ALLOCATION HISTORY (savings goals) -->
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      ALLOCATION HISTORY ({data.allocTotal})
    </div>
    {#if data.allocationHistory.length === 0}
      <p class="text-gray-600 text-xs p-2">No allocation history yet.</p>
    {:else}
      <table bind:this={allocTableRef}>
        <thead>
          <tr>
            <th class="pl-2 text-left">Date</th>
            <th class="text-right pr-1">Type</th>
            <th class="text-right pr-1">Amount</th>
            <th class="text-right pr-1">Account</th>
          </tr>
        </thead>
        <tbody>
          {#each data.allocationHistory as allocation}
            <tr class="border-b border-gray-200 last:border-0">
              <td class="pl-2 text-sm py-2">
                {formatDateShorthand(new Date(allocation.allocationDate))}
              </td>
              <td class="text-right pr-1 text-sm py-2">
                {#if allocation.type === "USER_ADD"}
                  <span class="text-green-700">+ADD</span>
                {:else if allocation.type === "USER_WITHDRAW"}
                  <span class="text-amber-600">-WITHDRAW</span>
                {:else if allocation.type === "GOAL_DELETED"}
                  <span class="text-red-700">DELETED</span>
                {:else if allocation.type === "AUTO_REDUCE_NEGATIVE_BALANCE"}
                  <span class="text-red-600">AUTO↓</span>
                {:else}
                  <span>{allocation.type}</span>
                {/if}
              </td>
              <td class="text-right pr-1 text-sm py-2">
                {#if allocation.amount >= 0}
                  <span class="text-green-700"
                    >+{formatCurrency(allocation.amount)}</span
                  >
                {:else}
                  <span class="text-amber-600"
                    >{formatCurrency(allocation.amount)}</span
                  >
                {/if}
              </td>
              <td class="text-right pr-1 text-sm py-2">
                {#if allocation.account}
                  <a href="/accounts/{allocation.account.slug}" class="bracket-link">
                    {truncateDisplay(allocation.account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}
                  </a>
                {:else}
                  <span class="text-gray-500">-</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <PaginationClient
      page={allocPage}
      totalPages={data.allocTotalPages}
      onPageChange={updateAllocPage}
      scrollTarget={allocTableRef}
    />
  </div>
{/if}
