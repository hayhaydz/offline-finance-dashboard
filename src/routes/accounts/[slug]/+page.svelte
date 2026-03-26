<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDateShorthand, formatDateTime } from '$lib/utils/currency';
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

	// Liabilities projection toggle state
	let projectionLength = $state(12); // 6, 12, or 24 months
	let projectionExpanded = $state(false); // Collapsed by default
	const paginatedProjection = $derived(data.projection?.slice(0, projectionLength) ?? []);

	// Period-sensitive derived metrics (update with 6m/12m/24m toggle)
	const periodTotalInterest = $derived(paginatedProjection.reduce((s, r) => s + r.interest, 0));
	const periodTotalPayments = $derived(paginatedProjection.reduce((s, r) => s + r.payment, 0));
	const periodEndBalance = $derived(paginatedProjection.at(-1)?.balance ?? null);

	// Debt-free date derived from TTZ months
	const debtFreeDate = $derived.by(() => {
		if (!data.ttz?.months) return null;
		const d = new Date();
		d.setMonth(d.getMonth() + data.ttz.months);
		return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
	});

	// Balance delta strip
	const balanceDelta1m = $derived(
		data.monthlyBalances.length >= 2
			? data.monthlyBalances[0].closingBalance - data.monthlyBalances[1].closingBalance
			: null
	);
	const balanceDelta12m = $derived(
		data.monthlyBalances.length >= 12
			? data.monthlyBalances[0].closingBalance - data.monthlyBalances[11].closingBalance
			: null
	);

	// Payment efficiency metric
	const paymentEfficiency = $derived.by(() => {
		if (!data.projection?.length || !data.projection[0].payment) return null;
		const interest = data.projection[0].interest;
		const payment = data.projection[0].payment;
		return {
			interestAmt: interest,
			principalAmt: payment - interest,
			interestPct: Math.round(interest / payment * 100)
		};
	});

	// Interest:principal lifetime ratio
	const lifetimeRatio = $derived.by(() => {
		if (data.ttz?.totalInterest == null) return null;
		const totalRepayment = data.currentBalance + data.ttz.totalInterest;
		if (totalRepayment <= 0) return null;
		return {
			totalRepayment,
			interestPct: Math.round(data.ttz.totalInterest / totalRepayment * 100)
		};
	});

	// Cumulative interest array for projection table (index-aligned with paginatedProjection)
	const cumulativeProjectionInterest = $derived(
		paginatedProjection.reduce<number[]>((acc, row) => {
			acc.push((acc.at(-1) ?? 0) + row.interest);
			return acc;
		}, [])
	);

	// Monthly transaction grouping for ledger headers
	const transactionGroups = $derived.by(() => {
		const groups = new Map<string, {
			monthKey: string;
			monthLabel: string;
			transactions: typeof data.transactions;
			inflow: number;
			outflow: number;
			net: number;
		}>();
		for (const tx of data.transactions) {
			const d = new Date(tx.transactionDate);
			const year = d.getUTCFullYear();
			const month = d.getUTCMonth();
			const key = `${year}-${String(month + 1).padStart(2, '0')}`;
			const label = new Date(Date.UTC(year, month, 1))
				.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
			if (!groups.has(key)) {
				groups.set(key, { monthKey: key, monthLabel: label, transactions: [], inflow: 0, outflow: 0, net: 0 });
			}
			const g = groups.get(key)!;
			g.transactions.push(tx);
			if (tx.amount > 0) g.inflow += tx.amount;
			else g.outflow += Math.abs(tx.amount);
			g.net += tx.amount;
		}
		return Array.from(groups.values());
	});

	// PSA burn rate projection (non-ISA savings only, derived client-side)
	const psaProjection = $derived.by(() => {
		if (!data.interestSummary || data.account.taxWrapper !== 'none') return null;
		const { taxFreeStatus, projectedInterest, taxYearEnd } = data.interestSummary;
		if (taxFreeStatus.overAllowance) {
			return { show: true, overAllowance: true, used: taxFreeStatus.used, allowance: taxFreeStatus.allowance, taxableExcess: taxFreeStatus.taxableAmount, breachMonth: null as string | null, onTrack: false };
		}
		const now = new Date();
		const msRemaining = new Date(taxYearEnd).getTime() - now.getTime();
		const monthsRemaining = msRemaining / (1000 * 60 * 60 * 24 * 30.44);
		const monthlyInterest = monthsRemaining > 0 ? projectedInterest / monthsRemaining : 0;
		const isApproaching = taxFreeStatus.used >= taxFreeStatus.allowance * 0.5;
		let breachMonth: string | null = null;
		let onTrack = true;
		if (monthlyInterest > 0 && taxFreeStatus.remaining > 0) {
			const monthsToBreachFromNow = taxFreeStatus.remaining / monthlyInterest;
			if (monthsToBreachFromNow <= monthsRemaining) {
				const breachDate = new Date(now);
				breachDate.setMonth(breachDate.getMonth() + Math.ceil(monthsToBreachFromNow));
				breachMonth = breachDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
				onTrack = false;
			}
		}
		if (!isApproaching && onTrack) return null;
		return { show: true, overAllowance: false, used: taxFreeStatus.used, allowance: taxFreeStatus.allowance, taxableExcess: 0, breachMonth, onTrack };
	});

	// ISA allowance fill projection based on last 3 months of deposit cadence
	const isaFillProjection = $derived.by(() => {
		if (!data.isaSummary || data.account.taxWrapper === 'none') return null;
		const reversedBalances = data.monthlyBalances; // already newest-first from server
		const cadenceDeltas: number[] = [];
		for (let i = 0; i < Math.min(3, reversedBalances.length - 1); i++) {
			const delta = reversedBalances[i].closingBalance - reversedBalances[i + 1].closingBalance;
			cadenceDeltas.push(Math.max(0, delta));
		}
		const avgDeposit = cadenceDeltas.length > 0
			? Math.round(cadenceDeltas.reduce((a, b) => a + b, 0) / cadenceDeltas.length)
			: 0;
		const taxYearEnd = new Date(data.isaSummary.taxYearEnd);
		const now = new Date();
		const monthsRemainingInTaxYear = Math.max(0, Math.round((taxYearEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
		if (data.isaSummary.remaining === 0) {
			return { full: true, avgDeposit: 0, projectedFillMonth: null as string | null, fillAfterTaxYearEnd: false, monthsRemainingInTaxYear };
		}
		let projectedFillMonth: string | null = null;
		let fillAfterTaxYearEnd = false;
		if (avgDeposit > 0) {
			const monthsToFill = data.isaSummary.remaining / avgDeposit;
			const fillDate = new Date(now);
			fillDate.setMonth(fillDate.getMonth() + Math.ceil(monthsToFill));
			projectedFillMonth = fillDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
			fillAfterTaxYearEnd = fillDate > taxYearEnd;
		}
		return { full: false, avgDeposit, projectedFillMonth, fillAfterTaxYearEnd, monthsRemainingInTaxYear };
	});

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
	let addNoteOpen = $state(false);

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
			transfer_out: 'Transfer Out',
			charge: 'Charge',
			payment: 'Payment',
			loan_disbursement: 'Loan Disbursement',
			mortgage_disbursement: 'Mortgage Disbursement',
			interest_charge: 'Interest Charge'
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
			transfer_out: 'bg-orange-100 text-orange-800',
			charge: 'bg-red-100 text-red-800',
			payment: 'bg-green-100 text-green-800',
			loan_disbursement: 'bg-green-100 text-green-800',
			mortgage_disbursement: 'bg-green-100 text-green-800',
			interest_charge: 'bg-amber-100 text-amber-800'
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

	// Interest status badge for projection eligibility
	const interestStatus = $derived(
		data.interestSummary?.projectionExclusionReason
			? { label: '[EXCLUDED]', class: 'text-gray-600' }
			: { label: '[INCLUDED]', class: 'text-green-700' }
	);

	// ISA tolerance status badge
	const isaStatus = $derived(() => {
		if (!data.isaSummary) return { label: '', class: '' };
		const util = data.isaSummary.utilizationPercent;
		if (util < 50) return { label: '[OK]', class: 'text-green-700' };
		if (util < 90) return { label: '[WARNING]', class: 'text-amber-700' };
		return { label: '[NEAR LIMIT]', class: 'text-red-700' };
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
	{#if balanceDelta1m !== null}
		{@const isLiability = data.account.category === 'liability'}
		{@const delta1mAbs = formatCurrency(Math.abs(balanceDelta1m))}
		{@const delta1mUp = balanceDelta1m > 0}
		{@const delta1mGood = isLiability ? !delta1mUp : delta1mUp}
		{@const delta1mColour = delta1mGood ? 'text-green-700' : 'text-red-700'}
		<div class="text-xs mt-1 tabular-nums text-gray-600 flex gap-3 flex-wrap">
			<span class={delta1mColour}>
				{delta1mUp ? '▲' : '▼'} {delta1mAbs}
				{isLiability && !delta1mUp ? 'repaid this month' : 'from last month'}
			</span>
			{#if balanceDelta12m !== null}
				{@const delta12mAbs = formatCurrency(Math.abs(balanceDelta12m))}
				{@const delta12mUp = balanceDelta12m > 0}
				{@const delta12mGood = isLiability ? !delta12mUp : delta12mUp}
				{@const delta12mColour = delta12mGood ? 'text-green-700' : 'text-red-700'}
				<span class="text-gray-400">|</span>
				<span class={delta12mColour}>
					{delta12mUp ? '▲' : '▼'} {delta12mAbs} from 12 months ago
				</span>
			{:else}
				<span class="text-gray-400">|</span>
				<span class="text-gray-400">— from 12 months ago</span>
			{/if}
		</div>
	{/if}
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
{#if data.account.category === 'liability' || data.interestSummary || data.rates.length > 0}
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
		<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
			<div class="flex items-center gap-2">
				<span>INTEREST:</span>
				{#if prevYear}
					<a href="?taxYearStart={data.interestSummary.prevTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Prev</a>
				{/if}
				<span class="font-normal text-sm">
					{new Date(data.interestSummary.taxYearStart).getFullYear()}/{String(new Date(data.interestSummary.taxYearEnd).getFullYear()).slice(-2)}
				</span>
				{#if nextYear}
					<a href="?taxYearStart={data.interestSummary.nextTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Next</a>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if data.interestSummary}
					<span class="text-xs font-bold {interestStatus.class}">{interestStatus.label}</span>
				{/if}
				{#if currentYearSlug}
					<a href="/accounts/interest/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
				{/if}
			</div>
		</div>

		<div class="border-b border-black p-2">
			<div class="text-xs text-gray-600 mb-2">
				({formatDate(data.interestSummary.taxYearStart)} to {formatDate(data.interestSummary.taxYearEnd)})
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

		<!-- PSA Burn Rate Projection -->
		{#if psaProjection?.show}
			<div class="border-b border-black px-2 py-1 text-xs">
				{#if psaProjection.overAllowance}
					<span class="text-red-700">PSA exceeded — {formatCurrency(psaProjection.taxableExcess)} taxable</span>
				{:else if !psaProjection.onTrack && psaProjection.breachMonth}
					<span>PSA: {formatCurrency(psaProjection.used)} of {formatCurrency(psaProjection.allowance)} used</span>
					<span class="text-gray-400"> · </span>
					<span class="text-amber-700">At current rates, you'll exceed by {psaProjection.breachMonth}</span>
				{:else}
					<span>PSA: {formatCurrency(psaProjection.used)} of {formatCurrency(psaProjection.allowance)} used</span>
					<span class="text-gray-400"> · </span>
					<span class="text-green-700">On track to stay within limit</span>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- ISA SUBSCRIPTION SUMMARY -->
	{#if data.account.taxWrapper !== 'none' && data.isaSummary}
		<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
			<div class="flex items-center gap-2">
				<span>ISA SUBSCRIPTION:</span>
				{#if prevYear}
					<a href="?isaTaxYearStart={data.isaSummary.prevTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Prev</a>
				{/if}
				<span class="font-normal text-sm">
					{new Date(data.isaSummary.taxYearStart).getFullYear()}/{String(new Date(data.isaSummary.taxYearEnd).getFullYear()).slice(-2)}
				</span>
				{#if nextYear}
					<a href="?isaTaxYearStart={data.isaSummary.nextTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Next</a>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<span class="text-xs font-bold {isaStatus.class}">{isaStatus.label}</span>
				{#if currentYearSlug}
					<a href="/accounts/isa/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
				{/if}
			</div>
		</div>

		<div class="border-b border-black p-2">
			<div class="text-xs text-gray-600 mb-2">
				({formatDate(data.isaSummary.taxYearStart)} to {formatDate(data.isaSummary.taxYearEnd)})
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

			<!-- ISA Fill Projection -->
			{#if isaFillProjection}
				<div class="mt-2 pt-2 border-t border-gray-300 text-xs">
					{#if isaFillProjection.full}
						<span class="text-green-700 font-bold">Allowance full for this tax year</span>
					{:else if isaFillProjection.avgDeposit === 0}
						<span class="text-gray-500">No recent deposits</span>
					{:else if isaFillProjection.projectedFillMonth}
						<span>At {formatCurrency(isaFillProjection.avgDeposit)}/month, you'll fill by <span class="font-bold">{isaFillProjection.projectedFillMonth}</span></span>
						{#if isaFillProjection.fillAfterTaxYearEnd}
							<span class="text-gray-500"> (tax year ends in {isaFillProjection.monthsRemainingInTaxYear} months)</span>
						{/if}
					{/if}
				</div>
			{/if}
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

<!-- DEBT PROJECTION SECTION -->
{#if data.account.category === 'liability' && data.projection}
	<!-- Header with status badge -->
	<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
		<div class="flex items-center gap-2">
			<span>DEBT PROJECTION</span>
			{#if data.debtHealthStatus}
				<span class="text-xs font-bold {data.debtHealthStatus.class}">{data.debtHealthStatus.label}</span>
			{/if}
		</div>
		<div class="flex items-center gap-3">
			<a href="/accounts/liabilities" class="bracket-link text-xs">View Breakdown</a>
			<button
				type="button"
				onclick={() => projectionExpanded = !projectionExpanded}
				class="bracket-link text-xs font-normal"
			>
				{projectionExpanded ? 'Collapse' : 'Expand Projection'}
			</button>
		</div>
	</div>

	<!-- Minimum payment trap warning -->
	{#if data.ttz?.months !== null && data.ttz?.months !== undefined && data.ttz.months > 120}
		<div class="px-2 py-1 border-b border-black text-xs text-red-700">
			[WARNING] At minimum payments, this debt takes {data.ttz.years !== null ? `${Math.ceil(data.ttz.years || 0)} years` : `${data.ttz.months} months`} and costs £{(data.ttz.totalInterest != null ? data.ttz.totalInterest / 100 : 0).toFixed(2)} in interest.
		</div>
	{/if}

	<!-- Summary Box -->
	<div class="p-2">
		<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
			<!-- Time to Zero -->
			<div>Time to Zero:</div>
			<div class="text-right font-bold">
				{#if data.ttz && data.ttz.months !== null}
					{#if data.ttz.years !== null && data.ttz.years < 1}
						{data.ttz.months} months
					{:else}
						{Math.floor(data.ttz.years || 0)}y {Math.round(((data.ttz.years || 0) % 1) * 12)}m
					{/if}
				{:else}
					<span class="text-amber-700">Never pays off</span>
				{/if}
			</div>

			<!-- Debt-free date -->
			{#if debtFreeDate}
				<div class="text-gray-500">Debt-free:</div>
				<div class="text-right font-bold">{debtFreeDate}</div>
			{/if}

			<!-- Monthly Interest -->
			<div>Monthly Interest:</div>
			<div class="text-right font-bold tabular-nums text-amber-700">
				{#if data.projection && data.projection[0]}
					£{(data.projection[0].interest / 100).toFixed(2)}
					<span class="font-normal text-xs">(£{(data.projection[0].interest / 30.44 / 100).toFixed(2)}/day)</span>
				{:else}
					£0.00
				{/if}
			</div>

			<!-- Total cost to clear -->
			{#if data.ttz?.totalInterest != null}
				<div>Total Interest Cost:</div>
				<div class="text-right font-bold text-red-700">£{(data.ttz.totalInterest / 100).toFixed(2)}</div>
			{/if}

			<!-- Interest:principal lifetime ratio -->
			{#if lifetimeRatio !== null}
				<div class="text-gray-500">Of total repayment:</div>
				<div class="text-right tabular-nums {lifetimeRatio.interestPct > 30 ? 'text-amber-700' : ''}">
					{lifetimeRatio.interestPct}% interest
					<span class="text-gray-500 font-normal text-xs">(£{(data.ttz!.totalInterest! / 100).toFixed(2)} of £{(lifetimeRatio.totalRepayment / 100).toFixed(2)})</span>
				</div>
			{/if}

			<!-- Payment efficiency -->
			{#if paymentEfficiency !== null}
				<div class="text-gray-500">Payment breakdown:</div>
				<div class="text-right tabular-nums text-xs">
					<span class="text-amber-700">£{(paymentEfficiency.interestAmt / 100).toFixed(2)} interest ({paymentEfficiency.interestPct}%)</span>
					<span class="text-gray-400"> · </span>
					<span class="text-green-700">£{(paymentEfficiency.principalAmt / 100).toFixed(2)} principal</span>
				</div>
			{/if}

			<!-- Utilization (revolving) or Progress (installment) -->
			{#if data.account.creditLimit}
				<div>Utilization:</div>
				<div class="text-right font-bold">{(data.currentBalance / data.account.creditLimit * 100).toFixed(1)}%</div>
			{:else if data.account.originalPrincipal}
				<div>Progress:</div>
				<div class="text-right font-bold">{((data.account.originalPrincipal - data.currentBalance) / data.account.originalPrincipal * 100).toFixed(1)}%</div>
			{/if}
		</div>

		<!-- Payment Suggestion -->
		{#if data.paymentSuggestion}
			<div class="mt-2 pt-2 border-t border-gray-300 text-xs">
				<span class="text-gray-700">Suggested: </span>
				<span class="font-bold text-green-700">£{data.paymentSuggestion.suggestedPayment / 100}</span>
				<span class="text-gray-700">
					(pays off {data.paymentSuggestion.monthsSaved} months faster, saves £{data.paymentSuggestion.interestSaved / 100})
				</span>
			</div>
		{/if}

		<!-- Overpayment Scenario Comparison -->
		{#if data.overpaymentScenarios}
			<div class="mt-2 pt-2 border-t border-gray-300">
				<div class="text-xs text-gray-500 mb-1">Overpayment scenarios:</div>
				<div class="overflow-x-auto">
					<table class="w-full text-xs tabular-nums border-collapse">
						<thead>
							<tr class="bg-gray-100 border-b border-gray-300">
								<th class="text-left py-1 pr-2 font-normal text-gray-500"></th>
								{#each data.overpaymentScenarios as scenario}
									<th class="text-right py-1 px-1 font-bold">{scenario.label}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Payment</td>
								{#each data.overpaymentScenarios as scenario}
									<td class="text-right px-1">{formatCurrency(scenario.payment)}</td>
								{/each}
							</tr>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Months to clear</td>
								{#each data.overpaymentScenarios as scenario}
									<td class="text-right px-1">{scenario.ttzMonths !== null ? `${scenario.ttzMonths}m` : '—'}</td>
								{/each}
							</tr>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Total interest</td>
								{#each data.overpaymentScenarios as scenario}
									<td class="text-right px-1 text-amber-700">{scenario.totalInterest !== null ? formatCurrency(scenario.totalInterest) : '—'}</td>
								{/each}
							</tr>
							<tr>
								<td class="py-1 pr-2 text-gray-500">Debt-free</td>
								{#each data.overpaymentScenarios as scenario}
									<td class="text-right px-1 text-green-700">{scenario.debtFreeDate ?? '—'}</td>
								{/each}
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Projection Length Toggle + Period Summary -->
		<div class="mt-2 pt-2 border-t border-gray-300">
			<div class="flex items-center gap-3 text-xs mb-2">
				<span class="text-gray-500">Period:</span>
				{#each [6, 12, 24] as months}
					<button
						type="button"
						class="bracket-link"
						class:font-bold={projectionLength === months}
						onclick={() => { projectionLength = months; projectionExpanded = true; }}
					>
						{months}m
					</button>
				{/each}
			</div>
			<!-- Period-sensitive metrics — update with toggle -->
			{#if paginatedProjection.length > 0}
				<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums text-gray-700">
					<div>Interest ({projectionLength}m):</div>
					<div class="text-right font-bold text-amber-700">£{(periodTotalInterest / 100).toFixed(2)}</div>
					<div>Payments ({projectionLength}m):</div>
					<div class="text-right font-bold">£{(periodTotalPayments / 100).toFixed(2)}</div>
					{#if periodEndBalance !== null}
						<div>Balance after {projectionLength}m:</div>
						<div class="text-right font-bold {periodEndBalance <= 0 ? 'text-green-700' : ''}">
							£{(periodEndBalance / 100).toFixed(2)}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Projection Table -->
	{#if projectionExpanded}
		<div class="border-b border-black p-2">
			<table class="projection-table w-full table-fixed min-w-[400px]">
				<thead>
					<tr>
						<th class="pl-2 text-left whitespace-nowrap w-[20%]">Month</th>
						<th class="text-right pr-1 whitespace-nowrap w-[20%]">Balance</th>
						<th class="text-right pr-1 whitespace-nowrap w-[20%]">Interest</th>
						<th class="text-right pr-1 whitespace-nowrap w-[20%]">Payment</th>
						<th class="text-right pr-2 whitespace-nowrap w-[20%]">Total Int.</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedProjection as row, i}
						<tr class="border-b border-gray-200 last:border-b-0 align-top">
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{row.month}</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap {row.balance >= 0 ? 'text-green-700' : 'text-red-700'}">
								£{row.balance / 100}
							</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap text-amber-700">
								£{row.interest / 100}
							</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
								£{row.payment / 100}
							</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-amber-700">
								£{((cumulativeProjectionInterest[i] ?? 0) / 100).toFixed(2)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
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

<!-- NOTES SECTION -->
<div class="border-t border-black">
	<div class="border-b border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>NOTES ({data.notes.length})</span>
		{#if !data.account.closedAt}
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => addNoteOpen = !addNoteOpen}
			>
				{addNoteOpen ? '[Cancel]' : '[Add Note]'}
			</button>
		{/if}
	</div>

	{#if addNoteOpen && !data.account.closedAt}
		<div class="border-b border-black p-2 bg-gray-50">
			<form
				method="POST"
				action="?/addNote"
				use:enhance={() => {
					return async ({ formElement, result }) => {
						if (result.type === 'success') {
							submitMessage = { type: 'success', text: 'Note added successfully' };
							formElement.reset();
							addNoteOpen = false;
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
				<div>
					<label for="noteContent" class="block text-sm font-bold mb-1">Note</label>
					<textarea
						id="noteContent"
						name="content"
						rows="4"
						maxlength="5000"
						placeholder="Opened this for the 5.1% rate, will review when it drops..."
						required
						class="w-full border border-black px-2 py-1 text-sm font-mono"
					></textarea>
					<div class="text-xs text-gray-600 mt-1">Max 5000 characters</div>
				</div>
				<div>
					<button
						type="submit"
						disabled={isSubmitting}
						class="bracket-link text-sm"
						class:opacity-50={isSubmitting}
					>
						{isSubmitting ? 'Adding...' : 'Add Note'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if data.notes.length === 0}
		<p class="text-gray-600 text-xs p-2">No notes yet. Add context for your future self.</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each data.notes as note}
				<div class="p-2">
					<div class="flex justify-between items-start gap-2">
						<div class="text-sm text-gray-700 whitespace-pre-wrap flex-1">
							{truncateDisplay(note.content, DISPLAY_LIMITS.NOTE_CONTENT)}
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<a
								href="/accounts/{data.account.slug}/notes/{note.slug}"
								class="bracket-link text-xs"
							>
								{formatDateTime(note.createdAt)}
							</a>
							{#if !data.account.closedAt}
								<form
									method="POST"
									action="?/deleteNote"
									class="inline"
									use:enhance={() => {
										return async ({ result }) => {
											if (result.type === 'success') {
												submitMessage = { type: 'success', text: 'Note deleted' };
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
									<input type="hidden" name="noteSlug" value={note.slug} />
									<button
										type="submit"
										class="text-xs text-red-700"
										onclick={(e) => { if (!confirm('Delete this note?')) e.preventDefault(); }}
									>
										[Delete]
									</button>
								</form>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
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
					{#each transactionGroups as group}
						<!-- Month header row -->
						<tr class="bg-gray-100 border-b border-gray-300">
							<td colspan="5" class="pl-2 py-1 text-xs font-bold">
								{group.monthLabel} — {group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}
								<span class="text-gray-400 font-normal"> · Net: </span>
								<span class="{group.net >= 0 ? 'text-green-700' : 'text-red-700'}">{group.net >= 0 ? '+' : ''}{formatCurrency(group.net)}</span>
								<span class="text-gray-400 font-normal"> ({formatCurrency(group.inflow)} in, {formatCurrency(group.outflow)} out)</span>
							</td>
						</tr>
						{#each group.transactions as transaction}
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
					{/each}
				</tbody>
			</table>
		</div>
		<div class="border-t border-black empty:hidden">
			<PaginationClient page={transactionPage} totalPages={data.transactionPagination.totalPages} onPageChange={updateTransactionPage} scrollTarget={transactionsSectionRef} />
		</div>
	{/if}
</div>
