<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { getExclusionReason } from '$lib/utils/formatting';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import type { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import type { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';

	type InterestSummary = {
		actualInterest: number;
		projectedInterest: number;
		totalExpectedInterest: number;
		taxYearStart: Date;
		taxYearEnd: Date;
		taxFreeStatus: { overAllowance: boolean; used: number; allowance: number; taxableAmount: number; remaining: number };
		projectionExclusionReason: string | null;
		prevTaxYearParam: string | null;
		nextTaxYearParam: string | null;
	};

	type IsaSummary = {
		subscribed: number;
		remaining: number;
		utilizationPercent: number;
		taxYearStart: Date;
		taxYearEnd: Date;
		prevTaxYearParam: string | null;
		nextTaxYearParam: string | null;
	};

	type Rate = { id: number; effectiveFrom: Date; rate: number };

	let {
		accountSlug,
		accountCategory,
		taxWrapper,
		closedAt,
		currentRate,
		interestSummary,
		isaSummary,
		rates,
		addRateOpen,
		feedback,
		ratesPagination,
		totalRatesPages,
		paginatedRates,
		ratesSectionRef,
		prevYear,
		nextYear,
		currentYearSlug,
		psaProjection,
		isaFillProjection,
		today,
	}: {
		accountSlug: string;
		accountCategory: string;
		taxWrapper: string;
		closedAt: Date | null;
		currentRate: number | null;
		interestSummary: InterestSummary | null;
		isaSummary: IsaSummary | null;
		rates: Rate[];
		addRateOpen: boolean;
		feedback: ReturnType<typeof useSubmitFeedback>;
		ratesPagination: { page: number; updatePage: (p: number) => Promise<void> };
		totalRatesPages: number;
		paginatedRates: Rate[];
		ratesSectionRef: HTMLElement | null;
		prevYear: { slug: string } | null;
		nextYear: { slug: string } | null;
		currentYearSlug: string | null;
		psaProjection: { show: boolean; overAllowance: boolean; used: number; allowance: number; taxableExcess: number; breachMonth: string | null; onTrack: boolean } | null;
		isaFillProjection: { full: boolean; avgDeposit: number; projectedFillMonth: string | null; fillAfterTaxYearEnd: boolean; monthsRemainingInTaxYear: number } | null;
		today: string;
	} = $props();

	function formatDate(date: Date): string {
		return formatDateShorthand(date);
	}

	const interestStatus = $derived(
		interestSummary?.projectionExclusionReason
			? { label: '[EXCLUDED]', class: 'text-gray-600' }
			: { label: '[INCLUDED]', class: 'text-green-700' }
	);

	const isaStatus = $derived(
		!isaSummary
			? { label: '', class: '' }
			: isaSummary.utilizationPercent < 50
				? { label: '[OK]', class: 'text-green-700' }
				: isaSummary.utilizationPercent < 90
					? { label: '[WARNING]', class: 'text-amber-700' }
					: { label: '[NEAR LIMIT]', class: 'text-red-700' }
	);

	const RATES_PER_PAGE = 5;
</script>

{#if accountCategory === 'liability' || interestSummary || rates.length > 0}
<div bind:this={ratesSectionRef}>
	<div class="border-y bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>INTEREST RATES {#if currentRate !== null}<span class="font-normal text-sm ml-2">({(currentRate / 100).toFixed(2)}% current)</span>{/if}</span>
		{#if !closedAt}
			<button
				type="button"
				class="bracket-link text-xs"
				onclick={() => addRateOpen = !addRateOpen}
			>
				{addRateOpen ? '[Cancel]' : '[Add Rate]'}
			</button>
		{/if}
	</div>

	{#if interestSummary && (interestSummary.actualInterest > 0 || !interestSummary.projectionExclusionReason)}
		<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
			<div class="flex items-center gap-2">
				<span>INTEREST:</span>
				{#if prevYear}
					<a href="?taxYearStart={interestSummary.prevTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Prev</a>
				{/if}
				<span class="font-normal text-sm">
					{new Date(interestSummary.taxYearStart).getFullYear()}/{String(new Date(interestSummary.taxYearEnd).getFullYear()).slice(-2)}
				</span>
				{#if nextYear}
					<a href="?taxYearStart={interestSummary.nextTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Next</a>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if interestSummary}
					<span class="text-xs font-bold {interestStatus.class}">{interestStatus.label}</span>
				{/if}
				{#if currentYearSlug}
					<a href="/accounts/interest/{currentYearSlug}" class="bracket-link text-xs">View Breakdown</a>
				{/if}
			</div>
		</div>

		<div class="border-b border-black p-2">
			<div class="text-xs text-gray-600 mb-2">
				({formatDate(interestSummary.taxYearStart)} to {formatDate(interestSummary.taxYearEnd)})
			</div>
			<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<div>Actual earned:</div>
				<div class="text-right tabular-nums">{formatCurrency(interestSummary.actualInterest)}</div>
				<div>Projected:</div>
				<div class="text-right tabular-nums">
					{#if interestSummary.projectionExclusionReason}
						<span class="text-gray-600 text-xs">
							(Not included - {getExclusionReason(interestSummary.projectionExclusionReason)})
						</span>
					{:else}
						{formatCurrency(interestSummary.projectedInterest)}
					{/if}
				</div>
				<div>Total expected:</div>
				<div class="text-right tabular-nums font-bold">{formatCurrency(interestSummary.totalExpectedInterest)}</div>
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
	{#if taxWrapper !== 'none' && isaSummary}
		<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
			<div class="flex items-center gap-2">
				<span>ISA SUBSCRIPTION:</span>
				{#if prevYear}
					<a href="?isaTaxYearStart={isaSummary.prevTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Prev</a>
				{/if}
				<span class="font-normal text-sm">
					{new Date(isaSummary.taxYearStart).getFullYear()}/{String(new Date(isaSummary.taxYearEnd).getFullYear()).slice(-2)}
				</span>
				{#if nextYear}
					<a href="?isaTaxYearStart={isaSummary.nextTaxYearParam}" class="bracket-link text-xs" data-sveltekit-noscroll>Next</a>
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
				({formatDate(isaSummary.taxYearStart)} to {formatDate(isaSummary.taxYearEnd)})
			</div>
			<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<div>Subscribed this year:</div>
				<div class="text-right tabular-nums text-green-700">{formatCurrency(isaSummary.subscribed)}</div>
				<div>Allowance remaining:</div>
				<div class="text-right tabular-nums {isaSummary.remaining > 0 ? 'text-green-700' : 'text-red-700'}">
					{formatCurrency(isaSummary.remaining)}
				</div>
				<div>Utilization:</div>
				<div class="text-right tabular-nums font-bold">
					{isaSummary.utilizationPercent}%
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

	{#if addRateOpen && !closedAt}
		<div class="border-b border-black p-2 bg-gray-50">
			<form
				method="POST"
				action="?/addInterestRate"
				use:enhance={feedback.createEnhanceHandler('Interest rate added successfully', { resetForm: true, onSuccess: () => { addRateOpen = false; } })}
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
						disabled={feedback.isSubmitting}
						class="bracket-link text-sm"
						class:opacity-50={feedback.isSubmitting}
					>
						{feedback.isSubmitting ? 'Adding...' : 'Add Rate'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if rates.length === 0}
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
						{@const isCurrent = rate.rate === currentRate && new Date(rate.effectiveFrom) <= new Date()}
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
								{#if !closedAt}
									<form
										method="POST"
										action="?/deleteInterestRate"
										class="inline"
										use:enhance={feedback.createEnhanceHandler('Interest rate deleted')}
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
		<PaginationClient page={ratesPagination.page} totalPages={totalRatesPages} onPageChange={ratesPagination.updatePage} scrollTarget={ratesSectionRef} />
	{/if}
</div>
{/if}
