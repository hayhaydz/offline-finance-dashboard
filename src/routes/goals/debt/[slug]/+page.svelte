<script lang="ts">
  import { formatCurrency, formatCurrencyShorthand, formatDate, formatDateShorthand } from '$lib/utils/currency';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const progressColor = (color: string) => {
    if (color === 'green') return { text: 'text-green-700', bg: 'bg-green-700' };
    if (color === 'amber') return { text: 'text-amber-600', bg: 'bg-amber-600' };
    return { text: 'text-red-600', bg: 'bg-red-600' };
  };

  const colors = $derived(progressColor(data.color));

  let showAllPayments = $state(false);

  function formatApr(basisPoints: number | null): string {
    if (basisPoints === null) return '\u2014';
    return `${(basisPoints / 100).toFixed(1)}%`;
  }
</script>

<div class="p-4 max-w-4xl">
  <!-- Header -->
  <div class="mb-4">
    <a href="/goals?type=debt" class="bracket-link text-xs">Back to Debt Goals</a>
    <h1 class="text-xl font-bold mb-1 mt-2">{data.goal.name}</h1>
    {#if data.goal.linkedAccount}
      <p class="text-sm text-gray-600">{data.goal.linkedAccount.name}</p>
    {/if}
  </div>

  <!-- SECTION 1: PAYOFF SUMMARY (Hero) -->
  <div class="border border-black bg-white mb-2">
    <div class="bg-gray-100 border-b border-black p-2">
      <span class="text-xs tracking-widest font-bold">PAYOFF SUMMARY</span>
    </div>
    <div class="p-3">
      <!-- Progress bar -->
      <div class="flex items-center gap-2 text-sm leading-none font-bold {colors.text} mb-3">
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

      <!-- 3-column stats -->
      <div class="grid grid-cols-3 border border-black divide-x divide-black mb-3">
        <div class="p-2 overflow-hidden">
          <div class="text-xs tracking-widest text-gray-500 mb-1">PAID</div>
          <div class="font-bold text-sm text-green-700 truncate">{formatCurrencyShorthand(data.progress.paidInCents)}</div>
          <div class="text-xs text-gray-500 truncate">{formatCurrency(data.progress.paidInCents)}</div>
        </div>
        <div class="p-2 overflow-hidden">
          <div class="text-xs tracking-widest text-gray-500 mb-1">STARTING</div>
          <div class="font-bold text-sm truncate">{formatCurrencyShorthand(data.progress.totalInCents)}</div>
          <div class="text-xs text-gray-500 truncate">{formatCurrency(data.progress.totalInCents)}</div>
        </div>
        <div class="p-2 overflow-hidden">
          <div class="text-xs tracking-widest text-gray-500 mb-1">REMAINING</div>
          <div class="font-bold text-sm {colors.text} truncate">{formatCurrencyShorthand(data.progress.remainingInCents)}</div>
          <div class="text-xs text-gray-500 truncate">{formatCurrency(data.progress.remainingInCents)}</div>
        </div>
      </div>

      <!-- Debt-free date + on track -->
      <div class="flex justify-between text-sm">
        <div>
          {#if data.goal.targetDate}
            <span class="text-gray-600">Debt-free target:</span>
            <span class="font-bold">{formatDate(new Date(data.goal.targetDate))}</span>
          {/if}
        </div>
        <div>
          {#if data.paceMetrics.projectedPayoffDate}
            <span class="text-gray-600">Projected:</span>
            <span class="font-bold {data.onTrack === true ? 'text-green-700' : data.onTrack === false ? 'text-amber-600' : ''}">
              {formatDate(new Date(data.paceMetrics.projectedPayoffDate))}
            </span>
            {#if data.onTrack !== null}
              <span class="text-xs ml-1 {data.onTrack ? 'text-green-700' : 'text-amber-600'} font-bold">
                {data.onTrack ? 'On track' : 'Behind'}
              </span>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- SECTION 2: COST BREAKDOWN -->
  <div class="border border-black bg-white mb-2">
    <div class="bg-gray-100 border-b border-black p-2">
      <span class="text-xs tracking-widest font-bold">COST BREAKDOWN</span>
    </div>
    <div class="p-3 text-sm">
      <div class="grid grid-cols-2 gap-y-2 gap-x-4">
        <div>
          <span class="text-gray-600">APR:</span>
          <span class="font-bold">{formatApr(data.interestData.aprBasisPoints)}</span>
        </div>
        <div>
          <span class="text-gray-600">Min payment:</span>
          <span class="font-bold">{data.interestData.minimumPaymentInCents > 0 ? formatCurrency(data.interestData.minimumPaymentInCents) + '/mo' : '\u2014'}</span>
        </div>
        <div>
          <span class="text-gray-600">Interest if min-only:</span>
          <span class="font-bold">{data.interestData.interestIfMinOnly !== null ? formatCurrency(data.interestData.interestIfMinOnly) : '\u2014'}</span>
        </div>
        <div>
          <span class="text-gray-600">Avg monthly payment:</span>
          <span class="font-bold">{data.paceMetrics.avgMonthlyPayment > 0 ? formatCurrency(data.paceMetrics.avgMonthlyPayment) + '/mo' : '\u2014'}</span>
        </div>
        {#if data.interestData.interestIfOnPace !== null}
          <div>
            <span class="text-gray-600">Interest if on-pace:</span>
            <span class="font-bold">{formatCurrency(data.interestData.interestIfOnPace)}</span>
          </div>
          <div>
            {#if data.interestData.interestSavedInCents !== null && data.interestData.interestSavedInCents > 0}
              <span class="text-gray-600">Saved by overpaying:</span>
              <span class="font-bold text-green-700">{formatCurrency(data.interestData.interestSavedInCents)}</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- SECTION 3: MILESTONES -->
  <div class="border border-black bg-white mb-2">
    <div class="bg-gray-100 border-b border-black p-2">
      <span class="text-xs tracking-widest font-bold">MILESTONES</span>
    </div>
    <div class="p-3">
      <div class="space-y-2">
        {#each (data.goal.milestones || []).toSorted((a, b) => b.thresholdInCents - a.thresholdInCents) as milestone}
          <div class="flex items-center gap-2 text-sm">
            <span class={milestone.reachedAt ? 'text-green-700' : 'text-gray-400'}>
              [{milestone.reachedAt ? '\u2713' : ' '}]</span>
            <span class={milestone.reachedAt ? 'font-bold text-green-700' : 'text-gray-600'}>
              {milestone.label}
            </span>
            {#if milestone.reachedAt}
              <span class="text-xs text-gray-500 ml-auto">
                {formatDateShorthand(milestone.reachedAt)}
              </span>
            {:else}
              <span class="text-xs text-gray-400 ml-auto">
                {formatCurrencyShorthand(milestone.thresholdInCents)} balance target
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- SECTION 4: PAYMENT HISTORY (Collapsible) -->
  {#if data.paymentHistory.length > 0}
    {@const payments = data.paymentHistory.filter(t => t.type === 'payment')}
    {@const displayedPayments = showAllPayments ? payments : payments.slice(0, 5)}
    <div class="border border-black bg-white mb-2">
      <div class="bg-gray-100 border-b border-black p-2 flex justify-between items-center">
        <span class="text-xs tracking-widest font-bold">PAYMENT HISTORY ({payments.length})</span>
        {#if payments.length > 5}
          <button
            type="button"
            onclick={() => showAllPayments = !showAllPayments}
            class="bracket-link text-xs"
          >
            {showAllPayments ? '[-] Less' : '[+] Show All'}
          </button>
        {/if}
      </div>
      <div class="p-3">
        <div class="space-y-1">
          {#each displayedPayments as payment}
            <div class="flex justify-between text-sm border-b border-gray-100 pb-1">
              <span class="text-gray-600">{formatDate(new Date(payment.transactionDate))}</span>
              <span class="text-green-700 font-bold">
                -{formatCurrency(Math.abs(payment.amount))}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex gap-2 pt-2 border-t border-gray-300 mt-4">
    {#if data.goal.linkedAccount?.slug}
      <a href="/accounts/{data.goal.linkedAccount.slug}" class="bracket-link text-xs">View Debt Account</a>
    {/if}
    <a href="/goals/debt/{data.goal.slug}/confirm-archive" class="bracket-link text-xs text-red-700">Archive</a>
  </div>
</div>
