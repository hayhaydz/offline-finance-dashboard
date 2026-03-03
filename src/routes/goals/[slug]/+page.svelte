<script lang="ts">
  import { formatCurrency, formatDateShorthand } from "$lib/utils/currency";
  import { getStaleness } from "$lib/utils/staleness";
  import { DISPLAY_LIMITS, truncateDisplay } from "$lib/utils/fieldLimits";
  import GoalDetailCard from "$lib/components/GoalDetailCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const staleness = $derived(getStaleness(new Date(data.goal.updatedAt)));

  // Helper to format account type
  function formatAccountType(type: string | null): string {
    if (!type) return "-";
    const typeMap: Record<string, string> = {
      current: "Current",
      savings: "Savings",
      investment: "Investment",
      "credit-card": "Credit Card",
      loan: "Loan",
      mortgage: "Mortgage",
    };
    return typeMap[type] ?? type;
  }

  // Helper to format tax wrapper
  function formatTaxWrapper(wrapper: string | null): string {
    if (!wrapper || wrapper === "none") return "";
    return wrapper.toUpperCase();
  }

  // Helper to format liquidity
  function formatLiquidity(liquidity: string | null): string {
    if (!liquidity) return "";
    const liquidityMap: Record<string, string> = {
      instant: "⚡ Instant",
      delayed: "⏳ Delayed",
      locked: "🔒 Locked",
    };
    return liquidityMap[liquidity] ?? liquidity;
  }

  // Helper to format days with appropriate label
  function formatDays(days: number | null): string {
    if (days === null) return "-";
    if (days === 0) return "Today";
    if (days === 1) return "1 day";
    if (days < 7) return `${days} days`;
    if (days < 30) return `${Math.round(days / 7)} weeks`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    return `${Math.round(days / 365)} years`;
  }

  // Helper to format percentage with color class
  function getOnTrackClass(onTrack: boolean | null): string {
    if (onTrack === null) return "text-gray-500";
    return onTrack ? "text-green-700" : "text-amber-600";
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
  <GoalDetailCard goal={data.goal} showArchive={true} />
</div>

<!-- ACCOUNT ALLOCATION BREAKDOWN -->
{#if data.accountAllocations.length > 0}
  <div class="border-t border-black">
    <div class="font-bold p-2 bg-gray-100 border-b border-black">
      SOURCE ACCOUNTS ({data.accountAllocations.length})
    </div>
    <table>
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
              <a href="/accounts/{alloc.accountId}" class="bracket-link">
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
              {#if formatTaxWrapper(alloc.taxWrapper)}
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
  </div>
{:else if data.goal.currentAllocation > 0}
  <div class="border-t border-black p-2 text-xs text-gray-600">
    ⚠️ Allocation data missing — goal shows {formatCurrency(data.goal.currentAllocation)} but no source accounts found
  </div>
{/if}

<!-- METRICS -->
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
          <span class="text-gray-600">⚡ Instant:</span>
          <span>{data.liquidityBreakdown.instantPercent}%</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">⏳ Delayed:</span>
          <span>{data.liquidityBreakdown.delayedPercent}%</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">🔒 Locked:</span>
          <span>{data.liquidityBreakdown.lockedPercent}%</span>
        </div>
        {#if data.liquidityBreakdown.hasLiquidityWarning}
          <div class="mt-2 p-1 bg-amber-100 border border-amber-400 text-amber-800">
            ⚠️ {data.liquidityBreakdown.warningMessage}
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
              ? formatDays(data.contributionStats.daysSinceLastContribution) + " ago"
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
        <div class="flex justify-between">
          <span class="text-gray-600">Net added:</span>
          <span>{formatCurrency(data.contributionStats.netContributedInCents)}</span>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ALLOCATION HISTORY -->
<div class="border-t border-black">
  <div class="font-bold p-2 bg-gray-100 border-b border-black">
    ALLOCATION HISTORY ({data.allocationHistory.length})
  </div>
  {#if data.allocationHistory.length === 0}
    <p class="text-gray-600 text-xs p-2">No allocation history yet.</p>
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
                <span>{truncateDisplay(allocation.account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</span>
              {:else}
                <span class="text-gray-500">-</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <Pagination
    currentPage={data.allocPage}
    totalPages={data.allocTotalPages}
    buildHref={(p) => `?allocPage=${p}`}
  />
</div>
