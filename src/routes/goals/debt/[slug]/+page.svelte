<script lang="ts">
  import { formatCurrency, formatCurrencyShorthand, formatDate } from '$lib/utils/currency';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const progressColor = (color: string) => {
    if (color === 'green') return { text: 'text-green-700', bg: 'bg-green-700' };
    if (color === 'amber') return { text: 'text-amber-600', bg: 'bg-amber-600' };
    return { text: 'text-red-600', bg: 'bg-red-600' };
  };

  const colors = progressColor(data.color);
</script>

<div class="p-4 max-w-4xl">
  <h1 class="text-xl font-bold mb-1">{data.goal.name}</h1>
  {#if data.goal.linkedAccount}
    <p class="text-sm text-gray-600 mb-4">{data.goal.linkedAccount.name}</p>
  {/if}

  <div class="border border-black p-3 mb-4 bg-white">
    <div class="flex items-center gap-2 text-sm leading-none font-bold {colors.text} mb-2">
      <span>[</span>
      <div class="flex-1 h-8 relative border-y border-gray-100">
        <div class="absolute inset-0 flex justify-between opacity-20">
          {#each Array(40) as _}
            <div class="w-px h-full bg-current"></div>
          {/each}
        </div>
        <div
          class="h-full {colors.bg} transition-all duration-300 mix-blend-multiply"
          style="width: {Math.min(100, Math.max(0, data.progress.percent))}%"
        ></div>
      </div>
      <span>]</span>
      <span class="text-sm min-w-9 text-right font-bold">{Math.round(data.progress.percent)}%</span>
    </div>

    <div class="grid grid-cols-3 border border-black divide-x divide-black">
      <div class="p-2 overflow-hidden">
        <div class="text-xs tracking-widest text-gray-500 mb-1">PAID</div>
        <div class="font-bold text-sm text-green-700 truncate">
          {formatCurrencyShorthand(data.progress.paidInCents)}
        </div>
        <div class="text-xs text-gray-500 truncate">{formatCurrency(data.progress.paidInCents)}</div>
      </div>
      <div class="p-2 overflow-hidden">
        <div class="text-xs tracking-widest text-gray-500 mb-1">REMAINING</div>
        <div class="font-bold text-sm {colors.text} truncate">
          {formatCurrencyShorthand(data.progress.remainingInCents)}
        </div>
        <div class="text-xs text-gray-500 truncate">{formatCurrency(data.progress.remainingInCents)}</div>
      </div>
      <div class="p-2 overflow-hidden">
        <div class="text-xs tracking-widest text-gray-500 mb-1">STARTING</div>
        <div class="font-bold text-sm truncate">
          {formatCurrencyShorthand(Math.abs(data.goal.startingBalanceInCents ?? 0))}
        </div>
        <div class="text-xs text-gray-500 truncate">
          {formatCurrency(Math.abs(data.goal.startingBalanceInCents ?? 0))}
        </div>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-3 gap-2 mb-4">
    <div class="border border-black p-2 bg-white">
      <div class="text-xs tracking-widest text-gray-500 mb-1">AVG MONTHLY</div>
      <div class="font-bold text-sm">
        {formatCurrencyShorthand(data.paceMetrics.avgMonthlyPayment)}
      </div>
    </div>
    <div class="border border-black p-2 bg-white">
      <div class="text-xs tracking-widest text-gray-500 mb-1">TOTAL PAID</div>
      <div class="font-bold text-sm text-green-700">
        {formatCurrencyShorthand(data.paceMetrics.totalPaidInCents)}
      </div>
    </div>
    <div class="border border-black p-2 bg-white">
      <div class="text-xs tracking-widest text-gray-500 mb-1">PROJECTED PAYOFF</div>
      <div class="font-bold text-sm">
        {data.paceMetrics.projectedPayoffDate
          ? formatDate(new Date(data.paceMetrics.projectedPayoffDate))
          : '-'}
      </div>
    </div>
  </div>

  {#if data.goal.targetDate}
    <div class="text-xs text-gray-600 mb-4">
      Target date: <span class="font-bold">{formatDate(new Date(data.goal.targetDate))}</span>
    </div>
  {/if}

  <div class="border border-black p-3 mb-4 bg-white">
    <div class="text-xs tracking-widest text-gray-500 mb-2">MILESTONES</div>
    <div class="space-y-1">
      {#each (data.goal.milestones || []).sort((a, b) => b.thresholdInCents - a.thresholdInCents) as milestone}
        <div class="flex items-center gap-2 text-sm">
          <span class={milestone.reachedAt ? 'text-green-700' : 'text-gray-400'}>
            {milestone.reachedAt ? '✓' : '○'}
          </span>
          <span class={milestone.reachedAt ? 'font-bold text-green-700' : 'text-gray-400'}>
            {milestone.label}
          </span>
          {#if milestone.reachedAt}
            <span class="text-xs text-gray-500 ml-auto">
              {formatDate(new Date(milestone.reachedAt))}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if data.paymentHistory.length > 0}
    <div class="border border-black p-3 mb-4 bg-white">
      <div class="text-xs tracking-widest text-gray-500 mb-2">PAYMENT HISTORY</div>
      <div class="space-y-1 max-h-60 overflow-y-auto">
        {#each data.paymentHistory.filter(t => t.type === 'payment') as payment}
          <div class="flex justify-between text-sm border-b border-gray-100 pb-1">
            <span>{formatDate(new Date(payment.transactionDate))}</span>
            <span class="text-green-700 font-bold">
              -{formatCurrency(Math.abs(payment.amount))}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="flex gap-2 pt-2 border-t border-gray-300">
    <a href="/goals/debt" class="bracket-link text-xs">Back to Debt Goals</a>
    <a href="/goals/debt/{data.goal.slug}/confirm-archive" class="bracket-link text-xs text-red-700">Archive</a>
  </div>
</div>
