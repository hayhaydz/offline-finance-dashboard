<script lang="ts">
  import { formatCurrency, formatDateShorthand } from "$lib/utils/currency";
  import { getStaleness } from "$lib/utils/staleness";
  import { DISPLAY_LIMITS, truncateDisplay } from "$lib/utils/fieldLimits";
  import GoalDetailCard from "$lib/components/GoalDetailCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const staleness = $derived(getStaleness(new Date(data.goal.updatedAt)));
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
          <tr class="border-b border-gray-200">
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
