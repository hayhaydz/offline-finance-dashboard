<script lang="ts">
	import AlertsSection from '$lib/components/AlertsSection.svelte';
	import SubmitFeedback from '$lib/components/SubmitFeedback.svelte';
	import AccountHeader from '$lib/components/account/AccountHeader.svelte';
	import InterestRatesSection from '$lib/components/account/InterestRatesSection.svelte';
	import DebtProjectionSection from '$lib/components/account/DebtProjectionSection.svelte';
	import MonthlyBalancesSection from '$lib/components/account/MonthlyBalancesSection.svelte';
	import NotesSection from '$lib/components/account/NotesSection.svelte';
	import TransactionsSection from '$lib/components/account/TransactionsSection.svelte';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';
	import { logComponentLifecycle, devLogClient } from '$lib/utils/client-logger';
	import { getExclusionReason } from '$lib/utils/formatting';
	import type { PageData, ActionData } from './$types';

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

	const txPagination = useUrlPagination('txPage');
	const ratesPagination = useUrlPagination('ratesPage');
	const balancesPagination = useUrlPagination('balancesPage');

	// Sync transaction pagination from server data
	$effect(() => {
		txPagination.page = data.transactionPagination.page;
	});

	// Interest rates pagination state
	const RATES_PER_PAGE = 5;
	const paginatedRates = $derived(data.rates.slice(ratesPagination.page * RATES_PER_PAGE, (ratesPagination.page + 1) * RATES_PER_PAGE));
	const totalRatesPages = $derived(Math.ceil(data.rates.length / RATES_PER_PAGE));

	// Monthly balance pagination state
	const BALANCES_PER_PAGE = 6;
	const paginatedBalances = $derived(data.monthlyBalances.slice(balancesPagination.page * BALANCES_PER_PAGE, (balancesPagination.page + 1) * BALANCES_PER_PAGE));
	const totalBalancesPages = $derived(Math.ceil(data.monthlyBalances.length / BALANCES_PER_PAGE));

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
		const reversedBalances = data.monthlyBalances;
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

	// Form submission feedback
	const feedback = useSubmitFeedback();

	// Accordion state
	let editMode = $state(false);
	let addTransactionOpen = $state(false);
	let addRateOpen = $state(false);
	let addNoteOpen = $state(false);

	// Get today's date in YYYY-MM-DD format for max attribute
	const today = new Date().toISOString().split('T')[0];

	// Sync form errors from server action results
	$effect(() => {
		if (form?.error) {
			feedback.message = { type: 'error', text: form.error as string };
		}
	});

	// Dev logging
	$effect(() => {
		logComponentLifecycle('AccountDetail', data.account.slug, 'mount', {
			accountType: data.account.type,
			accountName: data.account.name,
			isClosed: !!data.account.closedAt,
			currentBalance: data.currentBalance
		});

		devLogClient('AccountDetail', 'Interest data loaded', {
			hasInterestSummary: !!data.interestSummary,
			accountType: data.account.type,
			currentRate: data.currentRate,
			ratesCount: data.rates.length
		});

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

			if (data.interestSummary.projectionExclusionReason) {
				devLogClient('AccountDetail', 'Projection excluded - eligibility check', {
					reason: data.interestSummary.projectionExclusionReason,
					reasonText: getExclusionReason(data.interestSummary.projectionExclusionReason),
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
<AccountHeader
	slug={data.account.slug}
	name={data.account.name}
	type={data.account.type}
	taxWrapper={data.account.taxWrapper}
	institution={data.account.institution}
	liquidity={data.account.liquidity}
	balance={data.currentBalance}
	closedAt={data.account.closedAt}
	openedAt={data.account.openedAt}
	currentRate={data.currentRate}
	boeBaseRate={data.boeBaseRate}
	rateSpread={data.rateSpread}
	{balanceDelta1m}
	{balanceDelta12m}
	category={data.account.category}
/>

<SubmitFeedback message={feedback.message} onDismiss={feedback.dismiss} />

{#if form?.error}
	<div class="bg-amber-100 border-b border-black p-2 text-sm">
		{@html (form.error as string).replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">$1</a>')}
	</div>
{/if}

<div class="border-t border-black">
	<AlertsSection alerts={data.alerts} title="ALERTS FOR THIS ACCOUNT" />
</div>

<!-- INTEREST RATES SECTION -->
<InterestRatesSection
	accountSlug={data.account.slug}
	accountCategory={data.account.category}
	taxWrapper={data.account.taxWrapper}
	closedAt={data.account.closedAt}
	currentRate={data.currentRate}
	interestSummary={data.interestSummary}
	isaSummary={data.isaSummary}
	rates={data.rates}
	{addRateOpen}
	{feedback}
	ratesPagination={{ page: ratesPagination.page, updatePage: ratesPagination.updatePage }}
	{totalRatesPages}
	paginatedRates={paginatedRates}
	{ratesSectionRef}
	{prevYear}
	{nextYear}
	{currentYearSlug}
	{psaProjection}
	{isaFillProjection}
	{today}
/>

<!-- DEBT PROJECTION SECTION -->
{#if data.account.category === 'liability'}
	<DebtProjectionSection
		currentBalance={data.currentBalance}
		currentRate={data.currentRate}
		projection={data.projection ?? null}
		ttz={data.ttz ?? null}
		debtHealthStatus={data.debtHealthStatus ?? null}
		paymentSuggestion={data.paymentSuggestion ?? null}
		overpaymentScenarios={data.overpaymentScenarios ?? null}
		rateScenarios={data.rateScenarios ?? null}
		breakEvenMonthIndex={data.breakEvenMonthIndex ?? null}
		liabilityContext={data.liabilityContext ?? null}
		minimumPaymentType={data.account.minimumPaymentType}
		minimumPaymentFlat={data.account.minimumPaymentFlat}
		minimumPaymentPercentage={data.account.minimumPaymentPercentage}
		creditLimit={data.account.creditLimit}
		originalPrincipal={data.account.originalPrincipal}
		accountSlug={data.account.slug}
	/>
{/if}

<!-- MONTHLY BALANCE SUMMARY -->
<MonthlyBalancesSection
	balances={paginatedBalances}
	pagination={{ page: balancesPagination.page, updatePage: balancesPagination.updatePage }}
	totalPages={totalBalancesPages}
	sectionRef={balancesSectionRef}
/>

<!-- NOTES SECTION -->
<NotesSection
	accountSlug={data.account.slug}
	notes={data.notes}
	closedAt={data.account.closedAt}
	{addNoteOpen}
	{feedback}
/>

<!-- TRANSACTIONS SECTION -->
<TransactionsSection
	accountSlug={data.account.slug}
	transactions={data.transactions}
	categories={data.categories}
	recurringPatterns={data.recurringPatterns}
	closedAt={data.account.closedAt}
	{editMode}
	{addTransactionOpen}
	{feedback}
	pagination={{ page: txPagination.page, updatePage: txPagination.updatePage }}
	totalPages={data.transactionPagination.totalPages}
	sectionRef={transactionsSectionRef}
	{today}
/>
