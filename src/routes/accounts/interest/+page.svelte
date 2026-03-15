<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Tab/accordion state for breakdown sections
	let activeBreakdown = $state<'account' | 'month' | 'institution' | 'wrapper'>('account');

	// Helper function to format date range
	function formatDateRange(start: Date, end: Date): string {
		const startStr = formatDateShorthand(start);
		const endStr = formatDateShorthand(end);
		return `${startStr} to ${endStr}`;
	}

	// Helper function to format tax wrapper display
	function formatTaxWrapper(wrapper: string): string {
		if (wrapper === 'none') return 'None';
		return wrapper.toUpperCase();
	}

	// Helper function to get exclusion reason display
	function getExclusionReason(reason: string | null): string {
		const reasons: Record<string, string> = {
			no_balance: 'No balance',
			no_rate: 'No rate set',
			already_matured: 'Already matured',
			matures_after_tax_year: 'Matures after tax year end',
			closed_account: 'Account closed',
			non_interest_bearing: 'Not interest-bearing'
		};
		return reasons[reason || ''] || reason || 'Included';
	}

	// Helper to format rate for display
	function formatRate(basisPoints: number | null): string {
		if (basisPoints === null) return '-';
		return `${(basisPoints / 100).toFixed(2)}%`;
	}

	// Pagination state for transactions
	let transactionsPage = $state(0);
	const TRANSACTIONS_PER_PAGE = 25;

	// Sort state for transactions (default: date ascending)
	let transactionsSortDesc = $state(false);
	const sortedTransactions = $derived.by(() => {
		const txs = [...data.actual.transactions];
		if (transactionsSortDesc) {
			txs.reverse();
		}
		return txs;
	});

	// Paginated transactions
	const paginatedTransactions = $derived.by(() => {
		const start = transactionsPage * TRANSACTIONS_PER_PAGE;
		const end = start + TRANSACTIONS_PER_PAGE;
		return sortedTransactions.slice(start, end);
	});

	const totalTransactionPages = $derived(Math.ceil(sortedTransactions.length / TRANSACTIONS_PER_PAGE));

	// Sort state for account breakdown (default: amount descending)
	let accountsSortDesc = $state(true);
	const sortedAccounts = $derived.by(() => {
		const accounts = [...data.actual.byAccount];
		accounts.sort((a, b) => accountsSortDesc ? b.total - a.total : a.total - b.total);
		return accounts;
	});

	// Sort state for month breakdown (default: chronological)
	let monthsSortDesc = $state(false);
	const sortedMonths = $derived.by(() => {
		const months = [...data.actual.byMonth];
		months.sort((a, b) => {
			if (a.year !== b.year) return monthsSortDesc ? b.year - a.year : a.year - b.year;
			return monthsSortDesc ? b.month - a.month : a.month - b.month;
		});
		return months;
	});

	// Sort state for institution breakdown (default: amount descending)
	let institutionsSortDesc = $state(true);
	const sortedInstitutions = $derived.by(() => {
		const institutions = [...data.actual.byInstitution];
		institutions.sort((a, b) => institutionsSortDesc ? b.total - a.total : a.total - b.total);
		return institutions;
	});

	// Sort state for wrapper breakdown (default: amount descending)
	let wrappersSortDesc = $state(true);
	const sortedWrappers = $derived.by(() => {
		const wrappers = [...data.actual.byTaxWrapper];
		wrappers.sort((a, b) => wrappersSortDesc ? b.total - a.total : a.total - b.total);
		return wrappers;
	});

	// Filter to only show valid interest-bearing accounts (excluded accounts are not relevant for projection display)
	const validProjectedAccounts = $derived.by(() => {
		return data.projected.byAccount.filter(account => !account.exclusionReason);
	});

	// Sort state for projected accounts (default: amount descending)
	let projectedAccountsSortDesc = $state(true);
	const sortedProjectedAccounts = $derived.by(() => {
		const accounts = [...validProjectedAccounts];
		accounts.sort((a, b) => projectedAccountsSortDesc ? b.projectedInterest - a.projectedInterest : a.projectedInterest - b.projectedInterest);
		return accounts;
	});
</script>

<!-- HEADER SECTION -->
<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold m-0">Interest Breakdown</h1>
	<div class="text-sm text-gray-600 mt-1">
		Tax Year: {formatDateRange(data.meta.taxYearStart, data.meta.taxYearEnd)}
	</div>
	<div class="text-xs text-gray-500">
		As of {formatDateShorthand(data.meta.asOfDate)} • {data.meta.daysRemainingInTaxYear} days remaining in tax year
	</div>
</div>

<!-- KPI CARDS SECTION -->
<div class="border-b border-black">
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
		<!-- Posted (Actual) -->
		<div class="border-r border-black p-2">
			<div class="text-xs text-gray-600 mb-1">Posted (Actual)</div>
			<div class="text-lg font-bold text-green-700">{formatCurrency(data.actual.total)}</div>
			<div class="text-xs text-gray-500 mt-1">{data.actual.transactions.length} transactions</div>
		</div>

		<!-- Estimated (Projected) -->
		<div class="border-r border-black p-2">
			<div class="text-xs text-gray-600 mb-1">Estimated (Projected)</div>
			<div class="text-lg font-bold text-amber-700">{formatCurrency(data.projected.total)}</div>
			<div class="text-xs text-gray-500 mt-1">Remaining {data.meta.daysRemainingInTaxYear} days</div>
		</div>

		<!-- Forecast (Tax Year Total) -->
		<div class="border-r border-black p-2">
			<div class="text-xs text-gray-600 mb-1">Forecast (Tax Year Total)</div>
			<div class="text-lg font-bold">{formatCurrency(data.forecast.total)}</div>
			<div class="text-xs text-gray-500 mt-1">Actual + Projected</div>
		</div>

		<!-- PSA Status Now -->
		<div class="border-r border-black p-2">
			<div class="text-xs text-gray-600 mb-1">PSA Status Now</div>
			{#if data.forecast.psaStatusNow.overAllowance}
				<div class="text-sm font-bold text-red-700">
					Over by {formatCurrency(data.forecast.psaStatusNow.taxableAmount)}
				</div>
			{:else}
				<div class="text-sm font-bold text-green-700">
					{formatCurrency(data.forecast.psaStatusNow.remaining)} remaining
				</div>
			{/if}
			<div class="text-xs text-gray-500 mt-1">
				of {formatCurrency(data.forecast.psaStatusNow.allowance)} allowance
			</div>
		</div>

		<!-- PSA Status Forecast -->
		<div class="p-2">
			<div class="text-xs text-gray-600 mb-1">PSA Status Forecast</div>
			{#if data.forecast.psaStatusForecast.overAllowance}
				<div class="text-sm font-bold text-red-700">
					Over by {formatCurrency(data.forecast.psaStatusForecast.taxableAmount)}
				</div>
			{:else}
				<div class="text-sm font-bold text-green-700">
					{formatCurrency(data.forecast.psaStatusForecast.remaining)} remaining
				</div>
			{/if}
			<div class="text-xs text-gray-500 mt-1">
				at tax year end
			</div>
		</div>
	</div>
</div>

<!-- BREAKDOWN SECTIONS (ACCORDION/TABS) -->
<div class="border-b border-black">
	<div class="bg-gray-100 p-2 font-bold">Breakdowns</div>

	<!-- Tab buttons -->
	<div class="flex border-b border-black">
		<button
			type="button"
			class="px-2 py-1 text-sm border-r border-black {activeBreakdown === 'account' ? 'bg-white' : 'bg-gray-50'}"
			onclick={() => activeBreakdown = 'account'}
		>
			By Account
		</button>
		<button
			type="button"
			class="px-2 py-1 text-sm border-r border-black {activeBreakdown === 'month' ? 'bg-white' : 'bg-gray-50'}"
			onclick={() => activeBreakdown = 'month'}
		>
			By Month
		</button>
		<button
			type="button"
			class="px-2 py-1 text-sm border-r border-black {activeBreakdown === 'institution' ? 'bg-white' : 'bg-gray-50'}"
			onclick={() => activeBreakdown = 'institution'}
		>
			By Institution
		</button>
		<button
			type="button"
			class="px-2 py-1 text-sm {activeBreakdown === 'wrapper' ? 'bg-white' : 'bg-gray-50'}"
			onclick={() => activeBreakdown = 'wrapper'}
		>
			By Tax Wrapper
		</button>
	</div>

	<!-- Account Breakdown -->
	{#if activeBreakdown === 'account'}
		<div class="p-2">
			<div class="flex justify-between items-center mb-2">
				<span class="text-xs text-gray-600">{sortedAccounts.length} accounts</span>
				<button
					type="button"
					class="bracket-link text-xs"
					onclick={() => accountsSortDesc = !accountsSortDesc}
				>
					[{accountsSortDesc ? 'Low-High' : 'High-Low'}]
				</button>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th class="pl-2 text-left whitespace-nowrap">Account</th>
							<th class="text-left whitespace-nowrap">Institution</th>
							<th class="text-left whitespace-nowrap">Wrapper</th>
							<th class="text-right pr-2 whitespace-nowrap">Amount</th>
							<th class="text-right pr-2 whitespace-nowrap">Transactions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedAccounts as account}
							<tr class="border-b border-gray-200 last:border-b-0">
								<td class="pl-2 text-sm py-2 whitespace-nowrap">
									<a href="/accounts/{account.accountSlug}" class="bracket-link text-xs">{account.accountName}</a>
								</td>
								<td class="text-sm py-2 whitespace-nowrap">{account.accountInstitution || '-'}</td>
								<td class="text-sm py-2 whitespace-nowrap">{formatTaxWrapper(account.accountTaxWrapper)}</td>
								<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
									{formatCurrency(account.total)}
								</td>
								<td class="text-right pr-2 text-sm py-2 whitespace-nowrap">{account.transactionCount}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t border-black">
							<td colspan="3" class="pl-2 text-sm py-2 font-bold">Total</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-2 text-sm py-2">{data.actual.transactions.length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	{/if}

	<!-- Month Breakdown -->
	{#if activeBreakdown === 'month'}
		<div class="p-2">
			<div class="flex justify-between items-center mb-2">
				<span class="text-xs text-gray-600">{sortedMonths.length} months</span>
				<button
					type="button"
					class="bracket-link text-xs"
					onclick={() => monthsSortDesc = !monthsSortDesc}
				>
					[{monthsSortDesc ? 'Reverse' : 'Chronological'}]
				</button>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th class="pl-2 text-left whitespace-nowrap">Month</th>
							<th class="text-right pr-2 whitespace-nowrap">Amount</th>
							<th class="text-right pr-2 whitespace-nowrap">Transactions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedMonths as month}
							<tr class="border-b border-gray-200 last:border-b-0">
								<td class="pl-2 text-sm py-2 whitespace-nowrap">{month.monthName} {month.year}</td>
								<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
									{formatCurrency(month.total)}
								</td>
								<td class="text-right pr-2 text-sm py-2 whitespace-nowrap">{month.transactionCount}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t border-black">
							<td class="pl-2 text-sm py-2 font-bold">Total</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-2 text-sm py-2">{data.actual.transactions.length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	{/if}

	<!-- Institution Breakdown -->
	{#if activeBreakdown === 'institution'}
		<div class="p-2">
			<div class="flex justify-between items-center mb-2">
				<span class="text-xs text-gray-600">{sortedInstitutions.length} institutions</span>
				<button
					type="button"
					class="bracket-link text-xs"
					onclick={() => institutionsSortDesc = !institutionsSortDesc}
				>
					[{institutionsSortDesc ? 'Low-High' : 'High-Low'}]
				</button>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th class="pl-2 text-left whitespace-nowrap">Institution</th>
							<th class="text-right pr-2 whitespace-nowrap">Amount</th>
							<th class="text-right pr-2 whitespace-nowrap">Transactions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedInstitutions as institution}
							<tr class="border-b border-gray-200 last:border-b-0">
								<td class="pl-2 text-sm py-2 whitespace-nowrap">{institution.institution}</td>
								<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
									{formatCurrency(institution.total)}
								</td>
								<td class="text-right pr-2 text-sm py-2 whitespace-nowrap">{institution.transactionCount}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t border-black">
							<td class="pl-2 text-sm py-2 font-bold">Total</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-2 text-sm py-2">{data.actual.transactions.length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	{/if}

	<!-- Tax Wrapper Breakdown -->
	{#if activeBreakdown === 'wrapper'}
		<div class="p-2">
			<div class="flex justify-between items-center mb-2">
				<span class="text-xs text-gray-600">{sortedWrappers.length} wrappers</span>
				<button
					type="button"
					class="bracket-link text-xs"
					onclick={() => wrappersSortDesc = !wrappersSortDesc}
				>
					[{wrappersSortDesc ? 'Low-High' : 'High-Low'}]
				</button>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th class="pl-2 text-left whitespace-nowrap">Tax Wrapper</th>
							<th class="text-right pr-2 whitespace-nowrap">Amount</th>
							<th class="text-right pr-2 whitespace-nowrap">Transactions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedWrappers as wrapper}
							<tr class="border-b border-gray-200 last:border-b-0">
								<td class="pl-2 text-sm py-2 whitespace-nowrap">
									{formatTaxWrapper(wrapper.taxWrapper)}
									{#if wrapper.isTaxFree}
										<span class="ml-1 text-xs text-green-700">[Tax-free]</span>
									{/if}
								</td>
								<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
									{formatCurrency(wrapper.total)}
								</td>
								<td class="text-right pr-2 text-sm py-2 whitespace-nowrap">{wrapper.transactionCount}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t border-black">
							<td class="pl-2 text-sm py-2 font-bold">Total</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 font-bold text-green-700">
								{formatCurrency(data.actual.total)}
							</td>
							<td class="text-right pr-2 text-sm py-2">{data.actual.transactions.length}</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- PROJECTION ASSUMPTIONS TABLE -->
<div class="border-b border-black">
	<div class="bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>Projection Assumptions</span>
		<button
			type="button"
			class="bracket-link text-xs"
			onclick={() => projectedAccountsSortDesc = !projectedAccountsSortDesc}
		>
			[{projectedAccountsSortDesc ? 'Low-High' : 'High-Low'}]
		</button>
	</div>
	<div class="overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr>
					<th class="pl-2 text-left whitespace-nowrap w-[18%]">Account</th>
					<th class="text-right pr-2 whitespace-nowrap w-[10%]">Balance</th>
					<th class="text-right pr-2 whitespace-nowrap w-[8%]">Rate</th>
					<th class="text-right pr-2 whitespace-nowrap w-[8%]">Days</th>
					<th class="text-left whitespace-nowrap w-[12%]">Maturity</th>
					<th class="text-right pr-2 whitespace-nowrap w-[10%]">Projected</th>
					<th class="text-left whitespace-nowrap">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedProjectedAccounts as account}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="pl-2 text-sm py-2 whitespace-nowrap">
							<a href="/accounts/{account.accountSlug}" class="bracket-link text-xs">{account.accountName}</a>
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{formatCurrency(account.balanceInCents)}
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{formatRate(account.rateBasisPoints)}
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{account.exclusionReason ? '-' : account.daysUntilTaxYearEnd}
						</td>
						<td class="text-sm py-2 whitespace-nowrap">
							{#if account.maturityDate}
								{formatDateShorthand(account.maturityDate)}
								{#if account.daysUntilMaturity !== null}
									({account.daysUntilMaturity}d)
								{/if}
							{:else}
								-
							{/if}
						</td>
						<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap">
							{#if account.exclusionReason}
								<span class="text-gray-500">-</span>
							{:else}
								<span class="text-amber-700">+{formatCurrency(account.projectedInterest)}</span>
							{/if}
						</td>
						<td class="text-sm py-2">
							{#if account.exclusionReason}
								<span class="text-xs text-gray-500">{getExclusionReason(account.exclusionReason)}</span>
							{:else}
								<span class="text-xs text-green-700">Included</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t border-black">
					<td colspan="5" class="pl-2 text-sm py-2 font-bold">Total Projected</td>
					<td class="text-right pr-2 text-sm tabular-nums py-2 font-bold text-amber-700">
						{formatCurrency(data.projected.total)}
					</td>
					<td class="text-sm py-2">
						{data.projected.byAccount.filter(a => !a.exclusionReason).length} of {data.projected.byAccount.length} accounts
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
	<div class="p-2 text-xs text-gray-600 border-t border-black">
		<strong>Formula:</strong> balance &times; rate &times; (days / 365). Fixed-term accounts project only to maturity date. Only accounts with positive balance, positive rate, and open status are shown.
	</div>
</div>

<!-- RECONCILIATION PANEL -->
<div class="border-b border-black">
	<div class="bg-gray-100 p-2 font-bold">Reconciliation</div>
	<div class="p-2">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
			<div class="flex justify-between text-sm border-b border-gray-200 pb-1">
				<span>Transactions vs Total:</span>
				<span class="tabular-nums {data.reconciliation.actualVsTransactionsDelta !== 0 ? 'text-red-700 font-bold' : 'text-green-700'}">
					{data.reconciliation.actualVsTransactionsDelta === 0 ? 'OK' : formatCurrency(data.reconciliation.actualVsTransactionsDelta)}
				</span>
			</div>
			<div class="flex justify-between text-sm border-b border-gray-200 pb-1">
				<span>By Account vs Total:</span>
				<span class="tabular-nums {data.reconciliation.actualVsByAccountDelta !== 0 ? 'text-red-700 font-bold' : 'text-green-700'}">
					{data.reconciliation.actualVsByAccountDelta === 0 ? 'OK' : formatCurrency(data.reconciliation.actualVsByAccountDelta)}
				</span>
			</div>
			<div class="flex justify-between text-sm border-b border-gray-200 pb-1">
				<span>By Month vs Total:</span>
				<span class="tabular-nums {data.reconciliation.actualVsByMonthDelta !== 0 ? 'text-red-700 font-bold' : 'text-green-700'}">
					{data.reconciliation.actualVsByMonthDelta === 0 ? 'OK' : formatCurrency(data.reconciliation.actualVsByMonthDelta)}
				</span>
			</div>
		</div>
		{#if data.reconciliation.flags.length > 0}
			<div class="text-xs text-red-700 mt-2">
				<strong>Flags:</strong>
				<ul class="list-none pl-0 mt-1 space-y-1">
					{#each data.reconciliation.flags as flag}
						<li class="border-l-2 border-black pl-2">
							<span class="font-bold">[{flag.type.toUpperCase()}]</span> {flag.message}
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="text-xs text-green-700 mt-2">
				<strong>All reconciled ✓</strong> All breakdowns match the headline total.
			</div>
		{/if}
	</div>
</div>

<!-- TAX YEAR INTEREST RECORD SECTION -->
<div>
	<div class="bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>Tax Year Interest Record ({sortedTransactions.length} transactions)</span>
		<button
			type="button"
			class="bracket-link text-xs"
			onclick={() => transactionsSortDesc = !transactionsSortDesc}
		>
			[{transactionsSortDesc ? 'Oldest First' : 'Newest First'}]
		</button>
	</div>
	{#if sortedTransactions.length === 0}
		<p class="text-gray-600 text-xs p-2">No interest transactions posted yet.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-[800px] w-full">
				<thead>
					<tr>
						<th class="pl-2 text-left whitespace-nowrap w-[12%]">Date</th>
						<th class="text-left whitespace-nowrap w-[20%]">Account</th>
						<th class="text-left whitespace-nowrap w-[15%]">Institution</th>
						<th class="text-left whitespace-nowrap w-[12%]">Wrapper</th>
						<th class="text-right pr-2 whitespace-nowrap w-[12%]">Amount</th>
						<th class="text-right pr-2 whitespace-nowrap w-[14%]">Running Total</th>
						<th class="text-left whitespace-nowrap">Notes</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedTransactions as tx}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDateShorthand(tx.transactionDate)}</td>
							<td class="text-sm py-2 whitespace-nowrap">
								<a href="/accounts/{tx.accountSlug}" class="bracket-link text-xs">{tx.accountName}</a>
							</td>
							<td class="text-sm py-2 whitespace-nowrap">{tx.accountInstitution || '-'}</td>
							<td class="text-sm py-2 whitespace-nowrap">{formatTaxWrapper(tx.accountTaxWrapper)}</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
								+{formatCurrency(tx.amount)}
							</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap font-bold">
								{formatCurrency(tx.runningTotal)}
							</td>
							<td class="text-sm py-2 text-gray-600 truncate">{tx.description || '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<PaginationClient bind:page={transactionsPage} totalPages={totalTransactionPages} />
	{/if}
</div>