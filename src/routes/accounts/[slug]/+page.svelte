<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { invalidateAll } from '$app/navigation';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import type { PageData, ActionData } from './$types';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import type { TransactionType } from '$lib/server/transactions';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import { devLogClient, logComponentLifecycle } from '$lib/utils/client-logger';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Tax year navigation for interest breakdown links
	const currentYearSlug = $derived(
		data.interestSummary
			? `${data.interestSummary.taxYearStart.getUTCFullYear()}-${String(data.interestSummary.taxYearEnd.getUTCFullYear()).slice(-2)}`
			: data.isaSummary
				? `${data.isaSummary.taxYearStart.getUTCFullYear()}-${String(data.isaSummary.taxYearEnd.getUTCFullYear()).slice(-2)}`
				: null
	);
	const currentIndex = $derived(
		currentYearSlug !== null
			? data.availableTaxYears.findIndex((ty) => ty.slug === currentYearSlug)
			: -1
	);
	const prevYear = $derived(
		currentIndex >= 0 && currentIndex < data.availableTaxYears.length - 1
			? data.availableTaxYears[currentIndex + 1]
			: null
	);
	const nextYear = $derived(
		currentIndex > 0 ? data.availableTaxYears[currentIndex - 1] : null
	);

	let transactionPage = $state(data.transactionPagination.page);

	// Interest rates pagination state
	let ratesPage = $state(0);
	const RATES_PER_PAGE = 5;
	const paginatedRates = $derived(data.rates.slice(ratesPage * RATES_PER_PAGE, (ratesPage + 1) * RATES_PER_PAGE));
	const totalRatesPages = $derived(Math.ceil(data.rates.length / RATES_PER_PAGE));

	// Monthly balance pagination state
	let balancesPage = $state(0);
	const BALANCES_PER_PAGE = 6;
	const paginatedBalances = $derived(data.monthlyBalances.slice(balancesPage * BALANCES_PER_PAGE, (balancesPage + 1) * BALANCES_PER_PAGE));
	const totalBalancesPages = $derived(Math.ceil(data.monthlyBalances.length / BALANCES_PER_PAGE));

	// Scroll targets for pagination
	let transactionsSectionRef: HTMLElement | null = $state(null);
	let ratesSectionRef: HTMLElement | null = $state(null);
	let balancesSectionRef: HTMLElement | null = $state(null);

	// Track if we're updating to prevent loops
	let isUpdatingTransactionPage = $state(false);
	let isUpdatingRatesPage = $state(false);
	let isUpdatingBalancesPage = $state(false);

	// Sync pagination state with URL (1-indexed)
	$effect(() => {
		if (isUpdatingTransactionPage) return;
		const urlTxPage = Number(pageState.url.searchParams.get('txPage')) || 1;
		if (transactionPage !== urlTxPage - 1) transactionPage = urlTxPage - 1;

		if (isUpdatingRatesPage) return;
		const urlRatesPage = Number(pageState.url.searchParams.get('ratesPage')) || 1;
		if (ratesPage !== urlRatesPage - 1) ratesPage = urlRatesPage - 1;

		if (isUpdatingBalancesPage) return;
		const urlBalancesPage = Number(pageState.url.searchParams.get('balancesPage')) || 1;
		if (balancesPage !== urlBalancesPage - 1) balancesPage = urlBalancesPage - 1;
	});

	async function updateTransactionPage(newPage: number) {
		if (isUpdatingTransactionPage) return;
		isUpdatingTransactionPage = true;
		transactionPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('txPage', String(newPage + 1));
		} else {
			url.searchParams.delete('txPage');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingTransactionPage = false;
	}

	async function updateRatesPage(newPage: number) {
		if (isUpdatingRatesPage) return;
		isUpdatingRatesPage = true;
		ratesPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('ratesPage', String(newPage + 1));
		} else {
			url.searchParams.delete('ratesPage');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingRatesPage = false;
	}

	async function updateBalancesPage(newPage: number) {
		if (isUpdatingBalancesPage) return;
		isUpdatingBalancesPage = true;
		balancesPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set('balancesPage', String(newPage + 1));
		} else {
			url.searchParams.delete('balancesPage');
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdatingBalancesPage = false;
	}

	// Form submission feedback state
	let isSubmitting = $state(false);
	let submitMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Accordion state
	let addTransactionOpen = $state(false);
	let addRateOpen = $state(false);

	// Get today's date in YYYY-MM-DD format for max attribute
	const today = new Date().toISOString().split('T')[0];

	// Format date for display
	function formatDate(date: Date): string {
		return formatDateShorthand(date);
	}

	// Format date for input value (YYYY-MM-DD)
	function formatDateForInput(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	// Get account type display name
	function getAccountType(type: string): string {
		const types: Record<string, string> = {
			current: 'Current',
			savings: 'Savings',
			investment: 'Investment',
			'credit-card': 'Credit Card',
			loan: 'Loan',
			mortgage: 'Mortgage'
		};
		return types[type] || type;
	}

	// Get projection exclusion reason display text
	function exclusionReasonToText(reason: string | null): string {
		if (!reason) return '';
		const reasons: Record<string, string> = {
			closed_account: 'Account closed',
			no_balance: 'No current balance',
			no_rate: 'No interest rate set',
			already_matured: 'Bond already matured',
			matures_after_tax_year: 'Bond matures after tax year',
			non_interest_bearing: 'Not interest-bearing'
		};
		return reasons[reason] || reason;
	}

	// Get transaction type display name
	function getTransactionType(type: TransactionType): string {
		const types: Record<TransactionType, string> = {
			deposit: 'Deposit',
			withdrawal: 'Withdrawal',
			interest: 'Interest',
			interest_accrued: 'Interest (Accrued)',
			dividend: 'Dividend',
			value_change: 'Value Change',
			transfer_in: 'Transfer In',
			transfer_out: 'Transfer Out'
		};
		return types[type] || type;
	}

	// Get transaction type badge class
	function getTransactionTypeClass(type: TransactionType): string {
		const classes: Record<TransactionType, string> = {
			deposit: 'bg-green-100 text-green-800',
			withdrawal: 'bg-red-100 text-red-800',
			interest: 'bg-blue-100 text-blue-800',
			interest_accrued: 'bg-blue-50 text-blue-600 border border-blue-200',
			dividend: 'bg-purple-100 text-purple-800',
			value_change: 'bg-gray-100 text-gray-800',
			transfer_in: 'bg-cyan-100 text-cyan-800',
			transfer_out: 'bg-orange-100 text-orange-800'
		};
		return classes[type] || 'bg-gray-100 text-gray-800';
	}

	// Clear success messages after 10 seconds, errors persist until manually dismissed
	$effect(() => {
		if (submitMessage) {
			const timeout = setTimeout(() => {
				if (submitMessage?.type === 'success') {
					submitMessage = null;
				}
			}, 10000);
			return () => clearTimeout(timeout);
		}
	});

	// Show form submission result
	$effect(() => {
		if (form) {
			isSubmitting = false;
			if (form.error) {
				submitMessage = { type: 'error', text: form.error as string };
			}
		}
	});

	// Comprehensive interest data logging on mount and data changes
	$effect(() => {
		// Log component lifecycle
		logComponentLifecycle('AccountDetail', data.account.slug, 'mount', {
			accountType: data.account.type,
			accountName: data.account.name,
			isClosed: !!data.account.closedAt,
			currentBalance: data.currentBalance
		});

		// Log interest summary availability
		devLogClient('AccountDetail', 'Interest data loaded', {
			hasInterestSummary: !!data.interestSummary,
			accountType: data.account.type,
			currentRate: data.currentRate,
			ratesCount: data.rates.length
		});

		// Log detailed interest summary if available
		if (data.interestSummary) {
			devLogClient('AccountDetail', 'Interest summary details', {
				actualInterest: data.interestSummary.actualInterest,
				projectedInterest: data.interestSummary.projectedInterest,
				totalExpectedInterest: data.interestSummary.totalExpectedInterest,
				taxYearStart: data.interestSummary.taxYearStart.toISOString(),
				taxYearEnd: data.interestSummary.taxYearEnd.toISOString(),
				hasExclusionReason: !!data.interestSummary.projectionExclusionReason,
				exclusionReason: data.interestSummary.projectionExclusionReason
			});

			// Log eligibility analysis
			if (data.interestSummary.projectionExclusionReason) {
				devLogClient('AccountDetail', 'Projection excluded - eligibility check', {
					reason: data.interestSummary.projectionExclusionReason,
					reasonText: exclusionReasonToText(data.interestSummary.projectionExclusionReason),
					accountClosed: !!data.account.closedAt,
					balance: data.currentBalance,
					hasRate: data.currentRate !== null
				});
			} else {
				devLogClient('AccountDetail', 'Projection included - eligible account', {
					actualInterest: data.interestSummary.actualInterest,
					projectedInterest: data.interestSummary.projectedInterest,
					totalExpected: data.interestSummary.totalExpectedInterest
				});
			}
		} else {
			// Log why interest summary is not available
			devLogClient('AccountDetail', 'No interest summary - account analysis', {
				accountType: data.account.type,
				isSavingsOrInvestment: data.account.type === 'savings' || data.account.type === 'investment',
				isClosed: !!data.account.closedAt,
				currentBalance: data.currentBalance,
				currentRate: data.currentRate,
				hasRates: data.rates.length > 0,
				ratesCount: data.rates.length
			});
		}

		// Log interest rates data
		if (data.rates.length > 0) {
			devLogClient('AccountDetail', 'Interest rates loaded', {
				count: data.rates.length,
				currentRate: data.currentRate,
				rates: data.rates.map(r => ({
					effectiveFrom: r.effectiveFrom,
					rate: r.rate,
					isCurrent: r.rate === data.currentRate
				}))
			});
		}
	});
</script>

<!-- ACCOUNT INFO HEADER -->
<div class="p-2">
	<div class="flex justify-between items-center gap-2 mb-2">
		<h2 class="text-base font-bold m-0 min-w-0 overflow-hidden">
			<span class="truncate block">
				{data.account.name}
				{#if data.account.closedAt}
					<span class="text-xs font-normal text-gray-500 ml-1">[CLOSED]</span>
				{/if}
			</span>
		</h2>
		{#if !data.account.closedAt}
		<div class="flex gap-2 shrink-0">
			<a href="/accounts/{data.account.slug}/edit" class="bracket-link text-xs">Edit</a>
			<a href="/accounts/{data.account.slug}/delete" class="bracket-link text-xs text-red-700">Close</a>
		</div>
	{/if}
</div>
	<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
		<div>Type:</div>
		<div>{getAccountType(data.account.type)}</div>
		<div>Tax Wrapper:</div>
		<div>{data.account.taxWrapper === 'none' ? '-' : data.account.taxWrapper.toUpperCase()}</div>
		<div>Institution:</div>
		<div>{truncateDisplay(data.account.institution || '-', DISPLAY_LIMITS.INSTITUTION_NAME)}</div>
		<div>Liquidity:</div>
		<div class="capitalize">{data.account.liquidity}</div>
		<div>Current Balance:</div>
		<div class="font-bold {data.currentBalance >= 0 ? 'text-green-700' : 'text-red-700'}">{formatCurrency(data.currentBalance)}</div>
	</div>
</div>

{#if submitMessage}
	<div class="p-2 border-t text-sm flex justify-between items-start {submitMessage.type === 'error' ? 'bg-red-100' : 'bg-green-100'}">
		<div class="flex-1">
			{@html submitMessage.text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">$1</a>')}
		</div>
		<button
			type="button"
			onclick={() => submitMessage = null}
			class="ml-2 text-xs bracket-link"
		>
			[Dismiss]
		</button>
	</div>
{/if}

{#if form?.error}
	<div class="bg-amber-100 border-b border-black p-2 text-sm">
		{@html form.error.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">$1</a>')}
	</div>
{/if}

<!-- INTEREST RATES SECTION -->
{#if data.interestSummary || data.rates.length > 0}
<div bind:this={ratesSectionRef}>
	<div class="border-y bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>INTEREST RATES {#if data.currentRate !== null}<span class="font-normal text-sm ml-2">({(data.currentRate / 100).toFixed(2)}% current)</span>{/if}</span>
		{#if !data.account.closedAt}
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => addRateOpen = !addRateOpen}
			>
				{addRateOpen ? '[Cancel]' : '[Add Rate]'}
			</button>
		{/if}
	</div>

	{#if data.interestSummary && (data.interestSummary.actualInterest > 0 || !data.interestSummary.projectionExclusionReason)}
		<div class="border-b border-black p-2 bg-green-50">
			<div class="flex items-center justify-between gap-2 mb-2">
				<div class="flex items-center gap-2">
					<span class="font-bold text-sm">INTEREST:</span>
					{#if prevYear}
						<a href="?taxYearStart={data.interestSummary.prevTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>[Prev]</a>
					{/if}
					<span class="font-bold text-sm">
						{new Date(data.interestSummary.taxYearStart).getFullYear()}/{String(new Date(data.interestSummary.taxYearEnd).getFullYear()).slice(-2)}
					</span>
					{#if nextYear}
						<a href="?taxYearStart={data.interestSummary.nextTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>[Next]</a>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<div class="text-xs font-normal">
						({formatDate(data.interestSummary.taxYearStart)} to {formatDate(data.interestSummary.taxYearEnd)})
					</div>
					{#if currentYearSlug}
						<a href="/accounts/interest/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
					{/if}
				</div>
			</div>
			<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<div>Actual earned:</div>
				<div class="text-right tabular-nums">{formatCurrency(data.interestSummary.actualInterest)}</div>
				<div>Projected:</div>
				<div class="text-right tabular-nums">
					{#if data.interestSummary.projectionExclusionReason}
						<span class="text-gray-600 text-xs">
							(Not included - {exclusionReasonToText(data.interestSummary.projectionExclusionReason)})
						</span>
					{:else}
						{formatCurrency(data.interestSummary.projectedInterest)}
					{/if}
				</div>
				<div>Total expected:</div>
				<div class="text-right tabular-nums font-bold">{formatCurrency(data.interestSummary.totalExpectedInterest)}</div>
			</div>
		</div>
	{/if}

	<!-- ISA SUBSCRIPTION SUMMARY -->
	{#if data.account.taxWrapper !== 'none' && data.isaSummary}
		<div class="border-b border-black p-2 bg-amber-50">
			<div class="flex items-center justify-between gap-2 mb-2">
				<div class="flex items-center gap-2">
					<span class="font-bold text-sm">ISA SUBSCRIPTION:</span>
					{#if prevYear}
						<a href="?isaTaxYearStart={data.isaSummary.prevTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>[Prev]</a>
					{/if}
					<span class="font-bold text-sm">
						{new Date(data.isaSummary.taxYearStart).getFullYear()}/{String(new Date(data.isaSummary.taxYearEnd).getFullYear()).slice(-2)}
					</span>
					{#if nextYear}
						<a href="?isaTaxYearStart={data.isaSummary.nextTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>[Next]</a>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<div class="text-xs font-normal">
						({formatDate(data.isaSummary.taxYearStart)} to {formatDate(data.isaSummary.taxYearEnd)})
					</div>
					{#if currentYearSlug}
						<a href="/accounts/isa/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
					{/if}
				</div>
			</div>
			<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<div>Subscribed this year:</div>
				<div class="text-right tabular-nums text-green-700">{formatCurrency(data.isaSummary.subscribed)}</div>
				<div>Allowance remaining:</div>
				<div class="text-right tabular-nums {data.isaSummary.remaining > 0 ? 'text-green-700' : 'text-red-700'}">
					{formatCurrency(data.isaSummary.remaining)}
				</div>
				<div>Utilization:</div>
				<div class="text-right tabular-nums font-bold">
					{data.isaSummary.utilizationPercent}%
				</div>
			</div>
		</div>
	{/if}

	{#if addRateOpen && !data.account.closedAt}
		<div class="border-b border-black p-2 bg-gray-50">
			<form
				method="POST"
				action="?/addInterestRate"
				use:enhance={() => {
					return async ({ formElement, result }) => {
						if (result.type === 'success') {
							submitMessage = { type: 'success', text: 'Interest rate added successfully' };
							formElement.reset();
							addRateOpen = false;
						} else if (result.type === 'failure' && result.data) {
							const errorData = result.data as { error?: string };
							if (errorData.error) {
								submitMessage = { type: 'error', text: errorData.error };
							}
						}
						await invalidateAll();
					};
				}}
				class="flex flex-col gap-2"
			>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="rate" class="block text-sm font-bold mb-1">Rate (%)</label>
						<input
							type="text"
							id="rate"
							name="rate"
							placeholder="4.50"
							required
							step="0.01"
							min="0"
							max="100"
							class="w-full border border-black px-2 py-1 text-sm font-mono"
						/>
					</div>
					<div>
						<label for="effectiveFrom" class="block text-sm font-bold mb-1">Effective From</label>
						<input
							type="date"
							id="effectiveFrom"
							name="effectiveFrom"
							value={today}
							required
							class="w-full border border-black px-2 py-1 text-sm"
						/>
					</div>
				</div>
				<div>
					<button
						type="submit"
						disabled={isSubmitting}
						class="bracket-link text-sm"
						class:opacity-50={isSubmitting}
					>
						{isSubmitting ? 'Adding...' : 'Add Rate'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if data.rates.length === 0}
		<p class="text-gray-600 text-xs p-2">No interest rates recorded yet.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full table-fixed min-w-[400px]">
				<thead>
					<tr>
						<th class="pl-2 text-left whitespace-nowrap w-[30%]">Effective From</th>
						<th class="text-right pr-1 whitespace-nowrap w-[25%]">Rate</th>
						<th class="pl-2 text-left">Status</th>
						<th class="text-right pr-2 whitespace-nowrap w-[15%]">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedRates as rate}
						{@const isCurrent = rate.rate === data.currentRate && new Date(rate.effectiveFrom) <= new Date()}
						<tr class="border-b border-gray-200 last:border-b-0 align-top">
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDate(rate.effectiveFrom)}</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap font-bold">
								{(rate.rate / 100).toFixed(2)}%
							</td>
							<td class="pl-2 text-sm py-2">
								{#if isCurrent}
									<span class="text-xs text-green-700 font-bold">[CURRENT]</span>
								{:else if new Date(rate.effectiveFrom) > new Date()}
									<span class="text-xs text-amber-700">[FUTURE]</span>
								{:else}
									<span class="text-xs text-gray-500">[Historical]</span>
								{/if}
							</td>
							<td class="text-right pr-2 text-sm py-2 whitespace-nowrap">
								{#if !data.account.closedAt}
									<form
										method="POST"
										action="?/deleteInterestRate"
										class="inline"
										use:enhance={() => {
											return async ({ result }) => {
												if (result.type === 'success') {
													submitMessage = { type: 'success', text: 'Interest rate deleted' };
												} else if (result.type === 'failure' && result.data) {
													const errorData = result.data as { error?: string };
													if (errorData.error) {
														submitMessage = { type: 'error', text: errorData.error };
													}
												}
												await invalidateAll();
											};
										}}
									>
										<input type="hidden" name="rateId" value={rate.id} />
										<button
											type="submit"
											class="bracket-link text-xs text-red-700"
											onclick={(e) => { if (!confirm('Delete this rate?')) e.preventDefault(); }}
										>
											[Delete]
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<PaginationClient page={ratesPage} totalPages={totalRatesPages} onPageChange={updateRatesPage} scrollTarget={ratesSectionRef} />
	{/if}
</div>
{/if}

<!-- MONTHLY BALANCE SUMMARY -->
<div bind:this={balancesSectionRef}>
	<div class="bg-gray-100 p-2 font-bold border-y border-black">MONTHLY BALANCE SUMMARY (Derived from Transactions)</div>
	{#if data.monthlyBalances.length === 0}
		<p class="text-gray-600 text-xs p-2">No transactions yet. Monthly balance summary will appear automatically.</p>
	{:else}
		<div class="overflow-x-auto">
		<table class="w-full table-fixed min-w-[480px]">
			<thead>
				<tr>
					<th class="pl-2 text-left whitespace-nowrap w-[30%]">Month</th>
					<th class="text-right pr-1 whitespace-nowrap w-[35%]">Closing Balance</th>
					<th class="text-right pr-1 whitespace-nowrap w-[35%]">Net Change</th>
				</tr>
			</thead>
			<tbody>
				{#each paginatedBalances as balance}
					<tr class="border-b border-gray-200 last:border-b-0 align-top">
						<td class="pl-2 text-sm py-2 whitespace-nowrap">{balance.monthKey}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
							<span class={balance.closingBalance >= 0 ? 'text-green-700' : 'text-red-700'}>
								{formatCurrency(balance.closingBalance)}
							</span>
						</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
							<span class={balance.monthlyNetChange >= 0 ? 'text-green-700' : 'text-red-700'}>
								{balance.monthlyNetChange >= 0 ? '+' : ''}{formatCurrency(balance.monthlyNetChange)}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
		<PaginationClient page={balancesPage} totalPages={totalBalancesPages} onPageChange={updateBalancesPage} scrollTarget={balancesSectionRef} />
	{/if}
</div>

<!-- TRANSACTIONS SECTION -->
<div bind:this={transactionsSectionRef} class="border-t border-black">
	<div class="border-b border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>TRANSACTIONS</span>
		{#if !data.account.closedAt}
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => addTransactionOpen = !addTransactionOpen}
			>
				{addTransactionOpen ? '[Cancel]' : '[Add Transaction]'}
			</button>
		{/if}
	</div>

	{#if addTransactionOpen && !data.account.closedAt}
		<div class="border-b border-black p-2 bg-gray-50">
			<form
				method="POST"
				action="?/addTransaction"
				use:enhance={() => {
					return async ({ formElement, result }) => {
						if (result.type === 'success') {
							submitMessage = { type: 'success', text: 'Transaction added successfully' };
							formElement.reset();
							addTransactionOpen = false;
						} else if (result.type === 'failure' && result.data) {
							const errorData = result.data as { error?: string };
							if (errorData.error) {
								submitMessage = { type: 'error', text: errorData.error };
							}
						}
						await invalidateAll();
					};
				}}
				class="flex flex-col gap-2"
			>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="type" class="block text-sm font-bold mb-1">Type</label>
						<select
							id="type"
							name="type"
							required
							class="w-full border border-black px-2 py-1 text-sm"
						>
							<option value="deposit">Deposit</option>
							<option value="withdrawal">Withdrawal</option>
							<option value="interest">Interest</option>
							<option value="dividend">Dividend</option>
							<option value="value_change">Value Change</option>
							<option value="transfer_in">Transfer In</option>
							<option value="transfer_out">Transfer Out</option>
						</select>
					</div>
					<div>
						<label for="amount" class="block text-sm font-bold mb-1">Amount (£)</label>
						<input
							type="text"
							id="amount"
							name="amount"
							placeholder="123.45"
							required
							class="w-full border border-black px-2 py-1 text-sm font-mono"
						/>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="transactionDate" class="block text-sm font-bold mb-1">Date</label>
						<input
							type="date"
							id="transactionDate"
							name="transactionDate"
							value={today}
							max={today}
							required
							class="w-full border border-black px-2 py-1 text-sm"
						/>
					</div>
					<div>
						<label for="category" class="block text-sm font-bold mb-1">Category (optional)</label>
						<input
							type="text"
							id="category"
							name="category"
							placeholder="e.g., Salary, Rent"
							class="w-full border border-black px-2 py-1 text-sm font-mono"
						/>
					</div>
				</div>
				<div>
					<label for="description" class="block text-sm font-bold mb-1">Description (optional)</label>
					<input
						type="text"
						id="description"
						name="description"
						placeholder="Transaction details..."
						class="w-full border border-black px-2 py-1 text-sm font-mono"
					/>
				</div>
				<div>
					<button
						type="submit"
						disabled={isSubmitting}
						class="bracket-link text-sm"
						class:opacity-50={isSubmitting}
					>
						{isSubmitting ? 'Adding...' : 'Add Transaction'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if data.transactions.length === 0}
		<p class="text-gray-600 text-xs p-2">No transactions recorded yet.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full table-fixed min-w-[600px]">
				<thead>
					<tr>
						<th class="pl-2 text-left whitespace-nowrap w-[12%]">Date</th>
						<th class="text-left whitespace-nowrap w-[14%]">Type</th>
						<th class="text-right pr-1 whitespace-nowrap w-[16%]">Amount</th>
						<th class="pl-2 text-left">Description</th>
						<th class="text-right pr-2 whitespace-nowrap w-[10%]">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.transactions as transaction}
						<tr class="border-b border-gray-200 last:border-b-0 align-top">
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDate(transaction.transactionDate)}</td>
							<td class="text-sm py-2 whitespace-nowrap">
								<span class="px-1 text-xs {getTransactionTypeClass(transaction.type)}">
									{getTransactionType(transaction.type)}
								</span>
							</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
								<span class={transaction.amount >= 0 ? 'text-green-700' : 'text-red-700'}>
									{transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
								</span>
							</td>
							<td class="pl-2 text-sm py-2 text-gray-600 break-words">
								{truncateDisplay(transaction.description || '-', DISPLAY_LIMITS.BALANCE_NOTES)}
							</td>
							<td class="text-right pr-2 text-sm py-2 whitespace-nowrap">
								{#if !data.account.closedAt}
									<form
										method="POST"
										action="?/deleteTransaction"
										class="inline"
										use:enhance={() => {
											return async ({ result }) => {
												if (result.type === 'success') {
													submitMessage = { type: 'success', text: 'Transaction deleted' };
												} else if (result.type === 'failure' && result.data) {
													const errorData = result.data as { error?: string };
													if (errorData.error) {
														submitMessage = { type: 'error', text: errorData.error };
													}
												}
												await invalidateAll();
											};
										}}
									>
										<input type="hidden" name="transactionSlug" value={transaction.slug} />
										<button
											type="submit"
											class="bracket-link text-xs text-red-700"
											onclick={(e) => { if (!confirm('Delete this transaction?')) e.preventDefault(); }}
										>
											[Delete]
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="border-t border-black empty:hidden">
			<PaginationClient page={transactionPage} totalPages={data.transactionPagination.totalPages} onPageChange={updateTransactionPage} scrollTarget={transactionsSectionRef} />
		</div>
	{/if}
</div>
