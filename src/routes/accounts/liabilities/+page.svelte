<script lang="ts">
  import type { PageData } from './$types';
  import { formatCurrency } from '$lib/utils/currency';
  let { data }: { data: PageData } = $props();

  // v3.1 A03: liabilities as a terminal table — the v3 card stack read as
  // 7 full-width (1582×95) blocks at desktop; the data is table-shaped.
  // Row states mirror the card branches: TTZ text, amber no-rule link,
  // red payment-below-interest. Monthly interest = first projection month.

  function ttzText(liability: PageData['revolving'][number]): { text: string; cls: string } {
    if (liability.months === 0) return { text: 'pays off this month', cls: 'text-green-700' };
    if (liability.months !== null && liability.years !== null)
      return { text: `${Math.floor(liability.years)}y ${Math.round((liability.years % 1) * 12)}m`, cls: '' };
    if (liability.projectionNullReason === 'no_minimum_payment')
      return { text: 'no rule set', cls: 'text-amber-700' };
    return { text: 'payment < interest', cls: 'text-red-700 font-bold' };
  }

  function statusLabel(liability: PageData['revolving'][number]): { text: string; cls: string } {
    if (liability.months === null) return { text: 'CRITICAL', cls: 'text-red-700' };
    if (liability.years !== null && liability.years >= 5) return { text: 'WARNING', cls: 'text-amber-700' };
    return { text: 'HEALTHY', cls: 'text-green-700' };
  }

  function monthlyInterest(liability: PageData['revolving'][number]): number {
    return liability.projection[0]?.interest ?? 0;
  }

  const criticalCount = $derived(
    [...data.revolving, ...data.installment].filter((a) => a.months === null && a.projectionNullReason !== 'no_minimum_payment').length
  );
</script>

<!-- Header -->
<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
  <h1>LIABILITIES ({data.summary.count})</h1>
  <a href="/accounts" class="bracket-link text-xs">← Back to Accounts</a>
</div>

<!-- Summary strip -->
<div class="border-b border-black grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-300">
  <div class="px-2 py-1.5">
    <div class="text-[10px] uppercase font-bold text-gray-600">Total debt</div>
    <div class="text-sm font-bold tabular-nums text-red-700">{formatCurrency(data.summary.totalDebt)}</div>
    <div class="text-[10px] text-gray-500">across {data.summary.count} accounts</div>
  </div>
  <div class="px-2 py-1.5">
    <div class="text-[10px] uppercase font-bold text-gray-600">Monthly interest</div>
    <div class="text-sm font-bold tabular-nums text-amber-700">{formatCurrency(data.summary.totalMonthlyInterest)}</div>
    <div class="text-[10px] text-gray-500">first projected month</div>
  </div>
  <div class="px-2 py-1.5">
    <div class="text-[10px] uppercase font-bold text-gray-600">Revolving</div>
    <div class="text-sm font-bold tabular-nums">{data.revolving.length}</div>
    <div class="text-[10px] text-gray-500">credit cards</div>
  </div>
  <div class="px-2 py-1.5">
    <div class="text-[10px] uppercase font-bold text-gray-600">Installment</div>
    <div class="text-sm font-bold tabular-nums">{data.installment.length}</div>
    <div class="text-[10px] text-gray-500">loans + mortgage</div>
  </div>
  <div class="px-2 py-1.5">
    <div class="text-[10px] uppercase font-bold text-gray-600">Critical</div>
    <div class="text-sm font-bold tabular-nums {criticalCount > 0 ? 'text-red-700' : ''}">{criticalCount}</div>
    <div class="text-[10px] text-gray-500">payment below interest</div>
  </div>
</div>

{#snippet liabilityRows(liabilities: PageData['revolving'], mode: 'revolving' | 'installment')}
  {#each liabilities as liability (liability.id)}
    {@const ttz = ttzText(liability)}
    {@const status = statusLabel(liability)}
    <tr class="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
      <td class="pl-3 text-sm py-2 whitespace-nowrap">
        <a href="/accounts/{liability.slug}" class="bracket-link">{liability.name}</a>
      </td>
      <td class="text-right pr-3 text-sm py-2 whitespace-nowrap tabular-nums text-red-700">
        {formatCurrency(liability.balance)}
      </td>
      <td class="text-right pr-3 text-sm py-2 whitespace-nowrap tabular-nums">
        {#if mode === 'revolving'}
          {#if liability.utilization}
            {liability.utilization}%
          {:else}
            <span class="text-gray-600">-</span>
          {/if}
        {:else}
          {#if liability.progress}
            {liability.progress}% paid
          {:else}
            <span class="text-gray-600">-</span>
          {/if}
        {/if}
      </td>
      <td class="text-right pr-3 text-sm py-2 whitespace-nowrap tabular-nums">
        {#if monthlyInterest(liability) !== 0}
          {formatCurrency(monthlyInterest(liability))}
        {:else}
          <span class="text-gray-600">-</span>
        {/if}
      </td>
      <td class="text-right pr-3 text-sm py-2 whitespace-nowrap tabular-nums {ttz.cls}">
        {#if liability.projectionNullReason === 'no_minimum_payment'}
          <a href="/accounts/{liability.slug}/edit" class="bracket-link text-xs">Set rule</a>
        {:else}
          {ttz.text}
        {/if}
      </td>
      <td class="text-right pr-3 text-xs py-2 whitespace-nowrap font-bold {status.cls}">
        {status.text}
      </td>
    </tr>
  {/each}
{/snippet}

<!-- Revolving Section -->
{#if data.revolving.length > 0}
  <div class="border-y border-black bg-gray-100 p-2 font-bold text-xs uppercase">Revolving debt ({data.revolving.length})</div>
  <div class="overflow-x-auto">
    <table class="min-w-[860px] w-full">
      <thead>
        <tr>
          <th class="pl-3 text-left whitespace-nowrap min-w-[160px]">Name</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[110px]">Balance</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[80px]">Util</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[100px]">Monthly int</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[130px]">TTZ</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[90px]">Status</th>
        </tr>
      </thead>
      <tbody>
        {@render liabilityRows(data.revolving, 'revolving')}
      </tbody>
    </table>
  </div>
{/if}

<!-- Installment Section -->
{#if data.installment.length > 0}
  <div class="border-y border-black bg-gray-100 p-2 font-bold text-xs uppercase">Installment debt ({data.installment.length})</div>
  <div class="overflow-x-auto">
    <table class="min-w-[860px] w-full">
      <thead>
        <tr>
          <th class="pl-3 text-left whitespace-nowrap min-w-[160px]">Name</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[110px]">Balance</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[90px]">Progress</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[100px]">Monthly int</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[130px]">TTZ</th>
          <th class="text-right pr-3 whitespace-nowrap min-w-[90px]">Status</th>
        </tr>
      </thead>
      <tbody>
        {@render liabilityRows(data.installment, 'installment')}
      </tbody>
    </table>
  </div>
{/if}

{#if data.revolving.length === 0 && data.installment.length === 0}
  <p class="text-gray-600 text-xs p-2">No liability accounts found.</p>
{/if}
