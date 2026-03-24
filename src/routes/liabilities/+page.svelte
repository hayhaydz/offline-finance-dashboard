<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<div class="page-header">
  <h1>Liabilities</h1>
  <div class="summary">
    <div>Total Debt: £{(data.summary.totalDebt / 100).toFixed(2)}</div>
    <div>Monthly Interest: £{(data.summary.totalMonthlyInterest / 100).toFixed(2)}</div>
    <div>{data.summary.count} accounts</div>
  </div>
</div>

<section>
  <h2>Revolving Debt</h2>
  {#each data.revolving as liability}
    <div class="liability-card">
      <div class="name">{liability.name}</div>
      <div class="metrics">
        <span>Balance: £{(liability.balance / 100).toFixed(2)}</span>
        {#if liability.utilization}
          <span>Utilization: {liability.utilization}%</span>
        {/if}
        {#if liability.months}
          <span>TTZ: {liability.months} months</span>
        {:else}
          <span class="warning">Never pays off at current rate</span>
        {/if}
      </div>
      <a href="/accounts/{liability.slug}" class="bracket-link">[View details]</a>
    </div>
  {/each}
  {#if data.revolving.length === 0}
    <p>No revolving debt accounts found.</p>
  {/if}
</section>

<section>
  <h2>Installment Debt</h2>
  {#each data.installment as liability}
    <div class="liability-card">
      <div class="name">{liability.name}</div>
      <div class="metrics">
        <span>Balance: £{(liability.balance / 100).toFixed(2)}</span>
        {#if liability.progress}
          <span>Progress: {liability.progress}% paid</span>
        {/if}
        {#if liability.months && liability.years !== null}
          <span>TTZ: {Math.floor(liability.years)}y {Math.round((liability.years % 1) * 12)}m</span>
        {:else}
          <span class="warning">Never pays off at current rate</span>
        {/if}
      </div>
      <a href="/accounts/{liability.slug}" class="bracket-link">[View details]</a>
    </div>
  {/each}
  {#if data.installment.length === 0}
    <p>No installment debt accounts found.</p>
  {/if}
</section>

<style>
  .page-header {
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .summary {
    display: flex;
    gap: 1rem;
    margin: 1rem 0;
  }

  .summary div {
    border: 1px solid #000;
    padding: 0.5rem 1rem;
  }

  h2 {
    font-size: 1.25rem;
    margin: 2rem 0 1rem 0;
  }

  .liability-card {
    border: 1px solid #000;
    padding: 1rem;
    margin: 0.5rem 0;
  }

  .name {
    font-weight: bold;
    margin-bottom: 0.5rem;
  }

  .metrics {
    display: flex;
    gap: 1rem;
    margin: 0.5rem 0;
    flex-wrap: wrap;
  }

  .metrics span {
    white-space: nowrap;
  }

  .warning {
    color: var(--red);
  }

  .bracket-link {
    display: inline-block;
    margin-top: 0.5rem;
  }

  section {
    margin: 2rem 0;
  }

  p {
    color: #666;
  }
</style>
