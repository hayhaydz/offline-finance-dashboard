<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	
    let { data } = $props();
</script>

<div class="bg-gray-100 p-2 font-bold border-b border-black flex justify-between items-center">
    <span>INTEREST HISTORY</span>
    <a href="/accounts" class="bracket-link text-xs">[Back to Accounts]</a>
</div>

{#if data.taxYears.length === 0}
    <div class="p-2 text-gray-600 text-sm">No interest history found.</div>
{:else}
    <div class="overflow-x-auto">
        <table class="w-full table-fixed min-w-[600px]">
            <thead>
                <tr>
                    <th class="pl-2 text-left w-24">Tax Year</th>
                    <th class="text-right w-32">ISA Interest</th>
                    <th class="text-right w-32">Taxable Interest</th>
                    <th class="text-left pl-4">Allowance Status</th>
                    <th class="text-right pr-2 w-48">Action</th>
                </tr>
            </thead>
            <tbody>
                {#each data.taxYears as year}
                    <tr class="border-b border-gray-200 last:border-b-0">
                        <td class="pl-2 py-2 text-sm font-bold">{year.label}</td>
                        <td class="text-right py-2 text-sm tabular-nums text-green-700">{formatCurrency(year.isaInterest)}</td>
                        <td class="text-right py-2 text-sm tabular-nums text-green-700">{formatCurrency(year.nonIsaInterest)}</td>
                        <td class="pl-4 py-2 text-sm">
                            {#if year.status.overAllowance}
                                <span class="text-red-700 font-bold">Over by {formatCurrency(year.status.taxableAmount)}</span>
                                <span class="text-xs text-gray-600">({formatCurrency(year.status.allowance)} allowance)</span>
                            {:else}
                                <span class="text-green-700">Within allowance</span>
                                <span class="text-xs text-gray-600">({formatCurrency(year.status.remaining)} left)</span>
                            {/if}
                        </td>
                        <td class="text-right pr-2 py-2 text-sm whitespace-nowrap">
                            <a href="/accounts/interest/{year.slug}" class="bracket-link text-xs mr-2">[View Report]</a>
                            <a href="/accounts?taxYearStart={year.start.toISOString().split('T')[0]}" class="bracket-link text-xs">[View Accounts]</a>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
