<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import type { SnapshotPreviewData } from '$lib/types/snapshots';
	import { formatCurrencyShorthand } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';

	let { data, form }: { data: { preview: SnapshotPreviewData; defaultDate: string }; form: ActionData } =
		$props();

	// Get ISA breakdown with null safety
	const isaBreakdown = $derived(data.preview.isaBreakdown || null);

	// Get interest breakdown with null safety
	const interestBreakdown = $derived(data.preview.interestBreakdownDetail || null);

	// Group accounts by type for preview
	const accountsByType = $derived.by(() => {
		const groups: Record<string, typeof data.preview.accountsBreakdown.accounts> = {};
		data.preview.accountsBreakdown.accounts.forEach((account) => {
			if (!groups[account.type]) {
				groups[account.type] = [];
			}
			groups[account.type].push(account);
		});
		return groups;
	});

	// Capitalize account type for display
	function capitalizeType(type: string): string {
		return type
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	// v3.1 A06 design-quality: the Actual×Projected×Expected interest facts
	// as ONE matrix (was 9 label-value rows under 3 headings)
	const interestMatrix = $derived.by(() => {
		if (!interestBreakdown?.actualInterest) return null;
		const a = interestBreakdown.actualInterest;
		const p = interestBreakdown.projectedInterest;
		const t = interestBreakdown.totalExpected;
		return [
			{ label: 'Tax-free', actual: a.taxFree, projected: p.taxFree, expected: t.taxFree, green: true },
			{ label: 'Taxable', actual: a.taxable, projected: p.taxable, expected: t.taxable, green: false },
			{ label: 'TOTAL', actual: a.total, projected: p.total, expected: t.total, green: false, bold: true }
		];
	});
</script>

<div class="border-b border-black p-2 flex justify-between items-center">
	<h1 class="text-lg font-bold mb-0 mt-0">CREATE SNAPSHOT</h1>
	<div class="flex gap-2">
		<button type="submit" form="snapshot-form" class="bracket-link text-xs">Create Snapshot</button>
		<a href="/overview/snapshots" class="bracket-link text-xs">Cancel</a>
	</div>
</div>

<form method="POST" use:enhance id="snapshot-form" class="p-2 grid grid-cols-5 gap-2 items-start">
	<!-- v3.1 A06 design-quality + D0: the statement-entry moment as a 2-col
	     proof sheet — inputs beside the headline summary, like-for-like
	     ledgers paired, interest facts as one matrix. Was 2185px stack. -->

	<!-- FINANCIAL SUMMARY (the headline — left, shares the row gutter with
	     ACCOUNTS below: both rows split 3/2 at the same x) -->
	<div class="col-span-3 border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold bg-gray-100 border-b border-black p-2">FINANCIAL SUMMARY</div>
		<div class="p-2 text-sm">
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Net Worth:</span>
				<span class="text-base font-bold">{formatCurrencyShorthand(data.preview.netWorth)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Total Assets:</span>
				<span>{formatCurrencyShorthand(data.preview.totalAssets)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Total Liabilities:</span>
				<span>{formatCurrencyShorthand(data.preview.totalLiabilities)}</span>
			</div>
			<div class="flex justify-between py-1">
				<span class="text-gray-600">Total Allocated:</span>
				<span>{formatCurrencyShorthand(data.preview.totalAllocated, false)}</span>
			</div>
		</div>
		<div class="border-t border-gray-200 p-2 text-[10px] text-gray-500">
			The monthly statement record — balances, goals and allowances as entered, sealed to this date. Nothing here is live data.
		</div>
	</div>

	<!-- SNAPSHOT DATE + NOTES (the only inputs — right column) -->
	<div class="col-span-2 border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold bg-gray-100 border-b border-black p-2">SNAPSHOT DATE + NOTES</div>
		<div class="p-2 border-b border-black">
			<input
				type="date"
				id="snapshotDate"
				name="snapshotDate"
				value={data.defaultDate}
				required
				aria-label="Snapshot date"
				class="w-full border border-black p-1 text-sm focus:outline-none"
			/>
			<p class="text-xs text-gray-600 mt-1 mb-0">Default is today. Edit if needed.</p>
		</div>
		<div class="p-2">
			{#if form?.error}
				<p class="text-red-700 font-bold mb-2">{form.error}</p>
			{/if}
			<textarea
				id="notes"
				name="notes"
				rows="3"
				placeholder="Add context for this snapshot..."
				class="w-full border border-black p-1 text-sm focus:outline-none"
			></textarea>
		</div>
	</div>

	<!-- ACCOUNTS PREVIEW -->
	<div class="col-span-3 border border-black self-stretch">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			ACCOUNTS ({data.preview.accountsBreakdown.accounts.length})
		</div>
		<div class="p-2">
			{#each Object.entries(accountsByType) as [type, accounts]}
				<div class="font-bold text-xs mb-1 mt-1 first:mt-0">{capitalizeType(type)} ({accounts.length})</div>
				{#each accounts as account}
					<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors duration-150">
						<span>{truncateDisplay(account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</span>
						<span class="{account.includedInTotal ? '' : 'text-gray-500'}">
							{formatCurrencyShorthand(account.balanceInCents)}
							{!account.includedInTotal ? ' (excluded)' : ''}
						</span>
					</div>
				{/each}
			{/each}
		</div>
	</div>

	<!-- GOALS PREVIEW -->
	<div class="col-span-2 border border-black self-stretch">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			GOALS ({data.preview.goalsBreakdown.goals.length})
		</div>
		<div class="p-2">
			{#each data.preview.goalsBreakdown.goals as goal}
				<div class="text-xs flex justify-between gap-2 py-1 border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors duration-150">
					<span class="min-w-0 truncate">{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}{goal.goalType === 'debt' ? ' [DEBT]' : ''}</span>
					<!-- v3.1 A06 craft: current/target as fixed sub-columns so the
					     "/" separators align down the ledger -->
					<span class="shrink-0 flex tabular-nums">
						<span class="w-16 text-right">{#if goal.progressView}{formatCurrencyShorthand(goal.progressView.amountInCents)}{:else}{formatCurrencyShorthand(goal.currentAllocation)}{/if}</span>
						<span class="px-1 text-gray-400">/</span>
						<span class="w-16 text-right text-gray-600">{#if goal.progressView}{formatCurrencyShorthand(goal.progressView.targetInCents)}{:else}{formatCurrencyShorthand(goal.targetAmountInCents)}{/if}</span>
					</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- ISA ALLOWANCE + PERSONAL SAVINGS ALLOWANCE (paired tax facts) -->
	{#if isaBreakdown}
	<div class="col-span-2 border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			ISA ALLOWANCE ({isaBreakdown.taxYear.label})
		</div>
		{#if isaBreakdown.allowance}
		<div class="p-2 text-sm">
			<div class="text-[10px] text-gray-500 mb-1">
				Tax year {isaBreakdown.taxYear.start} to {isaBreakdown.taxYear.end}
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Used This Tax Year:</span>
				<span class="font-bold">{formatCurrencyShorthand(isaBreakdown.allowance.usedThisTaxYear)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">ISA Allowance:</span>
				<span>{formatCurrencyShorthand(isaBreakdown.allowance.limit)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Remaining:</span>
				<span class="{isaBreakdown.allowance.remaining >= 0 ? 'text-green-700' : 'text-red-700'}">
					{formatCurrencyShorthand(isaBreakdown.allowance.remaining)}
				</span>
			</div>
			<div class="flex justify-between py-1">
				<span class="text-gray-600">Total Deposits (Lifetime):</span>
				<span>{formatCurrencyShorthand(isaBreakdown.allowance.usedThisSnapshotDate)}</span>
			</div>
		</div>
		{:else}
		<div class="p-2 text-xs text-gray-600">ISA allowance data unavailable.</div>
		{/if}
	</div>
	{/if}

	{#if interestBreakdown?.actualInterest}
	<div class="col-span-3 border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			PERSONAL SAVINGS ALLOWANCE ({interestBreakdown.taxPosition.taxBand} rate)
		</div>
		<div class="p-2 text-sm">
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Allowance:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.taxPosition.personalSavingsAllowance.allowance)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Used:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.taxPosition.personalSavingsAllowance.used)}</span>
			</div>
			<div class="flex justify-between py-1">
				<span class="text-gray-600">Remaining:</span>
				<span class="{interestBreakdown.taxPosition.personalSavingsAllowance.overAllowance ? 'text-red-700 font-bold' : ''}">
					{formatCurrencyShorthand(interestBreakdown.taxPosition.personalSavingsAllowance.remaining)}
					{interestBreakdown.taxPosition.personalSavingsAllowance.overAllowance ? ' (exceeded!)' : ''}
				</span>
			</div>
		</div>
	</div>

	<!-- INTEREST MATRIX (Actual × Projected × Expected in one table) -->
	<div class="col-span-5 border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			INTEREST THIS TAX YEAR ({interestBreakdown.taxYear.label})
		</div>
		{#if interestMatrix}
		<table class="w-full">
			<thead>
				<tr class="border-b border-black">
					<th class="pl-2 py-1 text-left text-[10px] font-bold text-gray-600 uppercase"></th>
					<th class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Actual</th>
					<th class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Projected</th>
					<th class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Expected</th>
				</tr>
			</thead>
			<tbody>
				{#each interestMatrix as row}
					<tr class="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
						<td class="pl-2 py-1.5 text-sm {row.bold ? 'font-bold' : ''}">{row.label}</td>
						<td class="py-1.5 pr-2 text-right text-sm tabular-nums {row.green ? 'text-green-700' : ''} {row.bold ? 'font-bold' : ''}">{formatCurrencyShorthand(row.actual)}</td>
						<td class="py-1.5 pr-2 text-right text-sm tabular-nums text-gray-600 {row.bold ? 'font-bold' : ''}">{formatCurrencyShorthand(row.projected)}</td>
						<td class="py-1.5 pr-2 text-right text-sm tabular-nums {row.bold ? 'font-bold' : ''}">{formatCurrencyShorthand(row.expected)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{:else}
		<div class="p-2 text-xs text-gray-600">Interest breakdown data unavailable.</div>
		{/if}
	</div>

	<!-- BY ACCOUNT (2-col ledger) -->
	<div class="col-span-5 border border-black [&>*:last-child]:border-b-0">
		<div class="font-bold bg-gray-100 border-b border-black p-2">INTEREST BY ACCOUNT</div>
		<div class="p-2 grid grid-cols-1 md:grid-cols-2 gap-x-6">
			{#each interestBreakdown.byAccount as account}
				<div class="flex justify-between py-1 text-xs border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
					<span class="text-gray-600">{truncateDisplay(account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</span>
					<span class="tabular-nums">
						{formatCurrencyShorthand(account.actualInterestEarned)} actual · {formatCurrencyShorthand(account.projectedInterest)} proj
						{#if account.currentRate}
							· {(account.currentRate / 100).toFixed(2)}%
						{/if}
					</span>
				</div>
			{/each}
		</div>
	</div>
	{/if}
</form>
