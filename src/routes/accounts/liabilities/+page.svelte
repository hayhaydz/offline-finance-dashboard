<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  function getDebtStatusLabel(ttz: { months: number | null; years: number | null }): string {
    if (ttz.months === null) return '[CRITICAL]';
    if (ttz.years !== null && ttz.years >= 5) return '[WARNING]';
    return '[HEALTHY]';
  }

  function getDebtStatusClass(ttz: { months: number | null; years: number | null }): string {
    if (ttz.months === null) return 'text-red-700';
    if (ttz.years !== null && ttz.years >= 5) return 'text-amber-700';
    return 'text-green-700';
  }
</script>

<!-- Header -->
<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
  <h1>LIABILITIES</h1>
  <a href="/accounts" class="bracket-link text-xs">← Back to Accounts</a>
</div>

<!-- Summary Box -->
<div class="border-b border-black p-2">
  <div class="flex gap-4 text-sm tabular-nums">
    <div>Total Debt: <span class="font-bold text-red-700">£{(data.summary.totalDebt / 100).toFixed(2)}</span></div>
    <div>Monthly Interest: <span class="font-bold text-amber-700">£{(data.summary.totalMonthlyInterest / 100).toFixed(2)}</span></div>
    <div>{data.summary.count} accounts</div>
  </div>
</div>

<!-- Revolving Section -->
{#if data.revolving.length > 0}
  <div class="border-y border-black bg-gray-100 p-2 font-bold">REVOLVING DEBT</div>
  <div class="divide-y divide-gray-200">
    {#each data.revolving as liability}
      <div class="border-b border-black p-3">
        <div class="flex justify-between items-start mb-2">
          <span class="font-bold">{liability.name}</span>
          <span class="text-xs font-bold {getDebtStatusClass(liability)}">{getDebtStatusLabel(liability)}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm tabular-nums">
          <div>Balance: <span class="text-red-700">£{(liability.balance / 100).toFixed(2)}</span></div>
          {#if liability.utilization}
            <div>Util: <span class="font-bold">{liability.utilization}%</span></div>
          {/if}
          {#if liability.months && liability.years !== null}
            <div>TTZ: <span class="font-bold">{Math.floor(liability.years)}y {Math.round((liability.years % 1) * 12)}m</span></div>
          {:else}
            <div class="text-amber-700">Never pays off</div>
          {/if}
        </div>
        <a href="/accounts/{liability.slug}" class="bracket-link text-xs mt-2 inline-block">View details →</a>
      </div>
    {/each}
  </div>
{/if}

<!-- Installment Section -->
{#if data.installment.length > 0}
  <div class="border- border-black bg-gray-100 p-2 font-bold">INSTALLMENT DEBT</div>
  <div class="divide-y divide-gray-200">
    {#each data.installment as liability}
      <div class="border-b border-black p-3">
        <div class="flex justify-between items-start mb-2">
          <span class="font-bold">{liability.name}</span>
          <span class="text-xs font-bold {getDebtStatusClass(liability)}">{getDebtStatusLabel(liability)}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm tabular-nums">
          <div>Balance: <span class="text-red-700">£{(liability.balance / 100).toFixed(2)}</span></div>
          {#if liability.progress}
            <div>Progress: <span class="font-bold">{liability.progress}% paid</span></div>
          {/if}
          {#if liability.months && liability.years !== null}
            <div>TTZ: <span class="font-bold">{Math.floor(liability.years)}y {Math.round((liability.years % 1) * 12)}m</span></div>
          {:else}
            <div class="text-amber-700">Never pays off</div>
          {/if}
        </div>
        <a href="/accounts/{liability.slug}" class="bracket-link text-xs mt-2 inline-block">View details →</a>
      </div>
    {/each}
  </div>
{/if}

{#if data.revolving.length === 0 && data.installment.length === 0}
  <p class="text-gray-600 text-xs p-2">No liability accounts found.</p>
{/if}
