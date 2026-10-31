<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrencyShorthand } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';

	let { data, form } = $props();

	// Get accounts breakdown with null safety
	const accountsBreakdown = $derived(
		data.snapshot.accountsBreakdown || { accounts: [], totalByType: {}, snapshotTakenAt: '' }
	);

	// Get goals breakdown with null safety
	const goalsBreakdown = $derived(
		data.snapshot.goalsBreakdown || { goals: [], totalAllocated: 0 }
	);

	// Get ISA breakdown with null safety
	const isaBreakdown = $derived(
		data.snapshot.isaBreakdown || null
	);

	// Get interest breakdown with null safety
	const interestBreakdown = $derived(
		data.snapshot.interestBreakdownDetail || null
	);

	// Group accounts by type for display
	const accountsByType = $derived.by(() => {
		const groups: Record<string, typeof accountsBreakdown.accounts> = {};
		accountsBreakdown.accounts.forEach((account) => {
			if (!groups[account.type]) {
				groups[account.type] = [];
			}
			groups[account.type].push(account);
		});
		return groups;
	});

	// v3.1 third-mandate: the Actual×Projected×Expected interest matrix
	// (mirrors the create proof sheet — one table, not 3 label-value blocks)
	const interestMatrix = $derived.by(() => {
		const ib = interestBreakdown;
		if (!ib?.actualInterest) return null;
		return [
			{ label: 'Tax-free', actual: ib.actualInterest.taxFree, projected: ib.projectedInterest.taxFree, expected: ib.totalExpected.taxFree, green: true },
			{ label: 'Taxable', actual: ib.actualInterest.taxable, projected: ib.projectedInterest.taxable, expected: ib.totalExpected.taxable, green: false },
			{ label: 'TOTAL', actual: ib.actualInterest.total, projected: ib.projectedInterest.total, expected: ib.totalExpected.total, green: false, bold: true }
		];
	});

	// composition-bar consts (hoisted — {@const} must sit in a block)
	const assetsAbs = $derived(Math.abs(data.snapshot.totalAssetsInCents));
	const liabAbs = $derived(Math.abs(data.snapshot.totalLiabilitiesInCents));
	const compositionTotal = $derived(assetsAbs + liabAbs);

	// Capitalize account type for display
	function capitalizeType(type: string): string {
		return type
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
</script>

<!-- SNAPSHOT HEADER (v3.1 third-mandate: this page joins the proof-sheet
     language of the create page — was five stacked full-width bands of
     label-value rows that never used the viewport) -->
<div class="border-b border-black p-2 flex justify-between items-center">
	<div>
		<h1 class="text-lg font-bold m-0 leading-none">SNAPSHOT — {data.snapshot.snapshotDate}</h1>
		<div class="text-[10px] text-gray-500 mt-0.5">immutable record · the statement as entered on this date</div>
	</div>
	<a href="/overview/snapshots/{data.snapshot.slug}/delete" class="bracket-link text-xs text-red-700">Delete</a>
</div>

<div class="p-2 grid grid-cols-5 gap-2 items-start">
	<!-- FINANCIAL SUMMARY (the headline) -->
	<div class="col-span-3 border border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">FINANCIAL SUMMARY</div>
		<div class="p-2">
			<div class="text-[10px] uppercase font-bold text-gray-500">net worth</div>
			<div class="text-lg font-bold tabular-nums {data.snapshot.netWorthInCents >= 0 ? 'text-green-700' : 'text-red-700'}">
				{formatCurrencyShorthand(data.snapshot.netWorthInCents)}
			</div>
			<div class="flex h-2 border border-black mt-1" title="Assets {formatCurrencyShorthand(data.snapshot.totalAssetsInCents)} vs liabilities {formatCurrencyShorthand(data.snapshot.totalLiabilitiesInCents)}">
				{#if compositionTotal > 0}
					<div class="h-full bg-green-700" style="width: {(assetsAbs / compositionTotal) * 100}%"></div>
					<div class="h-full bg-red-700 flex-1"></div>
				{/if}
			</div>
			<div class="flex justify-between text-[10px] mt-1 tabular-nums">
				<span class="text-green-700 font-bold">A {formatCurrencyShorthand(data.snapshot.totalAssetsInCents)}</span>
				<span class="text-red-700 font-bold">L {formatCurrencyShorthand(data.snapshot.totalLiabilitiesInCents)}</span>
			</div>
			<div class="flex justify-between text-xs border-t border-gray-200 mt-1 pt-1">
				<span class="text-gray-600">Total Allocated to goals</span>
				<span class="tabular-nums">{formatCurrencyShorthand(data.snapshot.totalAllocatedInCents, false)}</span>
			</div>
		</div>
	</div>

	<!-- NOTES (the only editable surface — right column) -->
	<div class="col-span-2 border border-black flex flex-col">
		<div class="font-bold bg-gray-100 border-b border-black p-2">NOTES (EDITABLE)</div>
		<div class="p-2 flex-1 flex flex-col">
			{#if form?.error}
				<div class="mb-2 p-2 border border-red-700 bg-red-50 text-red-700 text-sm">
					{form.error}
				</div>
			{/if}
			<form method="POST" action="?/updateNotes" use:enhance class="flex-1 flex flex-col">
				<label class="block font-bold mb-1 text-xs" for="notes">
					Edit Notes
				</label>
				<textarea
					id="notes"
					name="notes"
					rows="4"
					placeholder="Add context for this snapshot..."
					class="w-full border border-gray-300 p-2 text-sm font-mono flex-1"
				>{data.snapshot.notes || ''}</textarea>
				<div class="flex justify-between items-center mt-2">
					<span class="text-[10px] text-gray-500">only notes are editable — financial data is immutable</span>
					<button type="submit" class="bracket-link text-sm">Save Notes</button>
				</div>
			</form>
		</div>
	</div>

	<!-- ACCOUNTS -->
	<div class="col-span-3 border border-black self-stretch">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			ACCOUNTS ({accountsBreakdown.accounts.length})
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

	<!-- GOALS -->
	<div class="col-span-2 border border-black self-stretch">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			GOALS ({goalsBreakdown.goals.length})
		</div>
		<div class="p-2">
			<p class="text-[10px] text-gray-600 mb-2">
				Allocations are money assigned to goals — not account balances.
			</p>
			{#each goalsBreakdown.goals as goal}
				<div class="text-xs flex justify-between gap-2 py-1 border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors duration-150">
					<span class="min-w-0 truncate">{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}{goal.goalType === 'debt' ? ' [DEBT]' : ''}</span>
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
	<div class="col-span-2 border border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			ISA ALLOWANCE ({isaBreakdown.taxYear.label})
		</div>
		{#if isaBreakdown.allowance}
		<div class="p-2 text-sm">
			{#if isaBreakdown.allowance.usedThisTaxYear > isaBreakdown.allowance.limit}
				<div class="border-2 border-red-700 text-red-700 p-1 mb-2 text-xs font-bold">
					[!] OVER-SUBSCRIBED BY {formatCurrencyShorthand(isaBreakdown.allowance.usedThisTaxYear - isaBreakdown.allowance.limit)} —
					exceeds the £20,000 annual ISA limit. Fix the underlying records.
				</div>
			{/if}
			<div class="flex justify-between py-1 border-b border-gray-200">
				<span class="text-gray-600">Used This Tax Year:</span>
				<span class="font-bold {isaBreakdown.allowance.usedThisTaxYear > isaBreakdown.allowance.limit ? 'text-red-700' : ''}">{formatCurrencyShorthand(isaBreakdown.allowance.usedThisTaxYear)}</span>
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
		<div class="p-2 text-xs text-gray-600">ISA allowance data unavailable for this snapshot.</div>
		{/if}
	</div>
	{/if}

	{#if interestBreakdown?.actualInterest}
	<div class="col-span-3 border border-black">
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

	<!-- INTEREST MATRIX (one table — was 3 label-value blocks + headings) -->
	{#if interestMatrix}
	<div class="col-span-5 border border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			INTEREST THIS TAX YEAR ({interestBreakdown.taxYear.label})
		</div>
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
	</div>

	<!-- BY ACCOUNT (2-col ledger) -->
	<div class="col-span-5 border border-black">
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
{:else if !isaBreakdown}
	<div class="col-span-5 border border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">ISA AND INTEREST DATA</div>
		<div class="p-2">
			<p class="text-xs text-gray-600">
				Historical ISA and interest data not available for this snapshot.
			</p>
		</div>
	</div>
{/if}
</div>
