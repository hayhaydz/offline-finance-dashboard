<script lang="ts">
  import { formatCurrency, formatCurrencyShorthand, formatDateShorthand } from '$lib/utils/currency';
  import type { DebtStrategyMetrics, DebtGoalWithProjection } from '$lib/server/debt-strategy';

  interface Props {
    metrics: DebtStrategyMetrics;
    selectedStrategy: 'snowball' | 'avalanche' | 'hybrid';
    onStrategyChange: (strategy: 'snowball' | 'avalanche' | 'hybrid') => void;
  }

  let { metrics, selectedStrategy, onStrategyChange }: Props = $props();

  const strategies: { key: 'snowball' | 'avalanche' | 'hybrid'; label: string }[] = [
    { key: 'snowball', label: 'Snowball' },
    { key: 'avalanche', label: 'Avalanche' },
    { key: 'hybrid', label: 'Hybrid' },
  ];

  const currentOrder = $derived(
    selectedStrategy === 'snowball' ? metrics.snowballOrder
    : selectedStrategy === 'avalanche' ? metrics.avalancheOrder
    : metrics.hybridOrder
  );

  function formatApr(basisPoints: number | null): string {
    if (basisPoints === null) return '—';
    return `${(basisPoints / 100).toFixed(1)}%`;
  }
</script>

<div class="border-b border-black bg-gray-50">
  <!-- Header row with 3 key metrics -->
  <div class="grid grid-cols-3 divide-x divide-black border-b border-black">
    <div class="p-2">
      <div class="text-[10px] font-bold text-gray-500 mb-1 uppercase">Total Debt</div>
      <div class="font-bold text-sm">{formatCurrency(metrics.totalDebtInCents)}</div>
    </div>
    <div class="p-2">
      <div class="text-[10px] font-bold text-gray-500 mb-1 uppercase">Monthly Min</div>
      <div class="font-bold text-sm">{formatCurrency(metrics.totalMonthlyMinimumInCents)}/mo</div>
    </div>
    <div class="p-2">
      <div class="text-[10px] font-bold text-gray-500 mb-1 uppercase">Debt-Free</div>
      <div class="font-bold text-sm">
        {metrics.projectedDebtFreeDate ? formatDateShorthand(metrics.projectedDebtFreeDate) : '—'}
      </div>
    </div>
  </div>

  <!-- Strategy toggle -->
  <div class="p-2 border-b border-gray-200 flex items-center gap-3">
    <span class="text-xs font-bold text-gray-500 uppercase">Strategy</span>
    <div class="flex gap-1">
      {#each strategies as strategy}
        <button
          type="button"
          onclick={() => onStrategyChange(strategy.key)}
          class="bracket-link text-xs"
          class:text-green-700={selectedStrategy === strategy.key}
        >
          {strategy.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Payoff order list -->
  <div class="p-2">
    <div class="text-[10px] font-bold text-gray-500 mb-2 uppercase">Payoff Order</div>
    {#each currentOrder as debt, index}
      <div class="flex items-center gap-2 text-xs py-1 {index < currentOrder.length - 1 ? 'border-b border-gray-100' : ''}">
        <span class="font-bold text-gray-400 min-w-4">{index + 1}.</span>
        <a href="/goals/debt/{debt.slug}" class="bracket-link flex-1">{debt.name}</a>
        <span class="tabular-nums">{formatCurrencyShorthand(debt.remainingInCents)}</span>
        <span class="text-gray-500">{formatApr(debt.aprBasisPoints)}</span>
      </div>
    {/each}
  </div>

  <!-- Interest comparison (only when avalanche saves money vs snowball) -->
  {#if metrics.interestSavedByAvalancheInCents !== null && metrics.interestSavedByAvalancheInCents > 0}
    <div class="px-2 pb-2 text-xs text-gray-600">
      Interest saved with Avalanche: {formatCurrency(metrics.interestSavedByAvalancheInCents)} vs Snowball
      {#if metrics.monthsSavedByAvalanche && metrics.monthsSavedByAvalanche > 0}
        ({metrics.monthsSavedByAvalanche} mo faster)
      {/if}
    </div>
  {/if}
</div>
