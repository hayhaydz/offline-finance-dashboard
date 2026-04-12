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
	const accountsByType = $derived(() => {
		const groups: Record<string, typeof accountsBreakdown.accounts> = {};
		accountsBreakdown.accounts.forEach((account) => {
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
</script>

<!-- SNAPSHOT HEADER -->
<div class="border-b border-black p-2">
	<div class="flex justify-between items-center">
		<h2 class="text-base font-bold m-0 leading-none">{data.snapshot.snapshotDate}</h2>
		<a href="/overview/snapshots/{data.snapshot.slug}/delete" class="bracket-link text-xs text-red-700">Delete</a>
	</div>
</div>

<!-- FINANCIAL DATA (READ-ONLY) -->
<div class="border-b border-black">
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2 mb-2">
		<span>FINANCIAL DATA (READ-ONLY)</span>
		<span>Immutable record</span>
	</div>

  <div class="p-2 pt-0">
    <h3 class="font-bold mb-2 text-sm">FINANCIAL SUMMARY</h3>
    <div class="text-sm">
      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
        <span class="text-gray-600">Net Worth:</span>
        <span class="font-bold">{formatCurrencyShorthand(data.snapshot.netWorthInCents)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
        <span class="text-gray-600">Total Assets:</span>
        <span>{formatCurrencyShorthand(data.snapshot.totalAssetsInCents)}</span>
      </div>
      <div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
        <span class="text-gray-600">Total Liabilities:</span>
        <span>{formatCurrencyShorthand(data.snapshot.totalLiabilitiesInCents)}</span>
      </div>
      <div class="flex justify-between py-1 last:border-0">
        <span class="text-gray-600">Total Allocated:</span>
        <span>{formatCurrencyShorthand(data.snapshot.totalAllocatedInCents)}</span>
      </div>
    </div>
  </div>
</div>

<!-- ACCOUNTS -->
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		ACCOUNTS ({accountsBreakdown.accounts.length})
	</div>
	<div class="p-2">
		{#each Object.entries(accountsByType()) as [type, accounts]}
			<div class="font-bold text-xs mb-1 mt-1 first:mt-0">{capitalizeType(type)} ({accounts.length})</div>
			{#each accounts as account}
				<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0">
					<span>{truncateDisplay(account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</span>
					<span class="{account.includedInTotal ? '' : 'text-gray-400'}">
						{formatCurrencyShorthand(account.balanceInCents)}
						{!account.includedInTotal ? ' (excluded)' : ''}
					</span>
				</div>
			{/each}
		{/each}
	</div>
</div>

<!-- GOALS -->
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		GOALS ({goalsBreakdown.goals.length})
	</div>
	<div class="p-2">
		{#each goalsBreakdown.goals as goal}
			<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span>{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}</span>
				<span
					>{formatCurrencyShorthand(goal.currentAllocation)} /
					{formatCurrencyShorthand(goal.targetAmountInCents)}</span
				>
			</div>
		{/each}
	</div>
</div>

<!-- ISA ALLOWANCE -->
{#if isaBreakdown}
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		ISA ALLOWANCE ({isaBreakdown.taxYear.label})
	</div>
	{#if isaBreakdown.allowance}
	<div class="p-2">
		<div class="text-xs text-gray-600 mb-2">
			Tax Year: {isaBreakdown.taxYear.start} to {isaBreakdown.taxYear.end}
		</div>
		<div class="text-sm">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Used This Tax Year:</span>
				<span class="font-bold">{formatCurrencyShorthand(isaBreakdown.allowance.usedThisTaxYear)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">ISA Allowance:</span>
				<span>{formatCurrencyShorthand(isaBreakdown.allowance.limit)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Remaining:</span>
				<span class="{isaBreakdown.allowance.remaining >= 0 ? 'text-green-700' : 'text-red-700'}">
					{formatCurrencyShorthand(isaBreakdown.allowance.remaining)}
				</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Total Deposits (Lifetime):</span>
				<span>{formatCurrencyShorthand(isaBreakdown.allowance.usedThisSnapshotDate)}</span>
			</div>
		</div>
	</div>
	{:else}
	<div class="p-2 text-xs text-gray-600">ISA allowance data unavailable for this snapshot.</div>
	{/if}
</div>
{/if}

<!-- INTEREST BREAKDOWN -->
{#if interestBreakdown}
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		INTEREST BREAKDOWN ({interestBreakdown.taxYear.label})
	</div>
	{#if interestBreakdown.actualInterest}
	<div class="p-2">
		<!-- Actual Interest -->
		<h4 class="font-bold text-xs mb-1">Actual Interest (This Tax Year)</h4>
		<div class="text-sm mb-3">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Tax-Free:</span>
				<span class="text-green-700">{formatCurrencyShorthand(interestBreakdown.actualInterest.taxFree)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Taxable:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.actualInterest.taxable)}</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Total Actual:</span>
				<span class="font-bold">{formatCurrencyShorthand(interestBreakdown.actualInterest.total)}</span>
			</div>
		</div>

		<!-- Projected Interest -->
		<h4 class="font-bold text-xs mb-1">Projected Interest (To Tax Year End)</h4>
		<div class="text-sm mb-3">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Tax-Free:</span>
				<span class="text-green-700">{formatCurrencyShorthand(interestBreakdown.projectedInterest.taxFree)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Taxable:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.projectedInterest.taxable)}</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Total Projected:</span>
				<span class="font-bold">{formatCurrencyShorthand(interestBreakdown.projectedInterest.total)}</span>
			</div>
		</div>

		<!-- Expected Total -->
		<h4 class="font-bold text-xs mb-1">Expected Total (Actual + Projected)</h4>
		<div class="text-sm mb-3">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Tax-Free:</span>
				<span class="text-green-700">{formatCurrencyShorthand(interestBreakdown.totalExpected.taxFree)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Taxable:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.totalExpected.taxable)}</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Total Expected:</span>
				<span class="font-bold">{formatCurrencyShorthand(interestBreakdown.totalExpected.total)}</span>
			</div>
		</div>

		<!-- Personal Savings Allowance -->
		<h4 class="font-bold text-xs mb-1">Personal Savings Allowance ({interestBreakdown.taxPosition.taxBand} rate)</h4>
		<div class="text-sm mb-3">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Allowance:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.taxPosition.personalSavingsAllowance.allowance)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Used:</span>
				<span>{formatCurrencyShorthand(interestBreakdown.taxPosition.personalSavingsAllowance.used)}</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Remaining:</span>
				<span class="{interestBreakdown.taxPosition.personalSavingsAllowance.overAllowance ? 'text-red-700' : ''}">
					{formatCurrencyShorthand(interestBreakdown.taxPosition.personalSavingsAllowance.remaining)}
					{interestBreakdown.taxPosition.personalSavingsAllowance.overAllowance ? ' (exceeded!)' : ''}
				</span>
			</div>
		</div>

		<!-- By Account -->
		<h4 class="font-bold text-xs mb-1">By Account</h4>
		<div class="text-xs">
			{#each interestBreakdown.byAccount as account}
				<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
					<span class="text-gray-600">{truncateDisplay(account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</span>
					<span>
						Actual: {formatCurrencyShorthand(account.actualInterestEarned)}
						| Projected: {formatCurrencyShorthand(account.projectedInterest)}
						{#if account.currentRate}
							| Rate: {(account.currentRate / 100).toFixed(2)}%
						{/if}
					</span>
				</div>
			{/each}
		</div>
	</div>
	{:else}
	<div class="p-2 text-xs text-gray-600">Interest breakdown data unavailable for this snapshot.</div>
	{/if}
</div>
{:else if !isaBreakdown && !interestBreakdown}
<!-- Backfill message for old snapshots -->
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		ISA AND INTEREST DATA
	</div>
	<div class="p-2">
		<p class="text-xs text-gray-600">
			Historical ISA and interest data not available for this snapshot.
		</p>
	</div>
</div>
{:else}
<!-- Partial data available -->
<div class="border-b border-black">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		PARTIAL ISA AND INTEREST DATA
	</div>
	<div class="p-2">
		<p class="text-xs text-gray-600">
			Partial data available for this snapshot. Some fields may be missing.
		</p>
	</div>
</div>
{/if}

<!-- NOTES (EDITABLE) -->
<div class="">
	<div class="font-bold bg-gray-100 border-b border-black p-2">
		NOTES (EDITABLE)
	</div>
	<div class="p-2">
		{#if form?.error}
			<div class="mb-2 p-2 border border-red-700 bg-red-50 text-red-700 text-sm">
				{form.error}
			</div>
		{/if}

		<form method="POST" action="?/updateNotes" use:enhance>
			<label class="block font-bold mb-1 text-sm" for="notes">
				Edit Notes
			</label>
			<textarea
				id="notes"
				name="notes"
				rows="5"
				placeholder="Add context for this snapshot..."
				class="w-full border border-gray-300 p-2 text-sm font-mono"
			>{data.snapshot.notes || ''}</textarea>
			<p class="text-xs text-gray-600 mt-2 mb-2">
				Only the notes field can be edited. Financial data is immutable.
			</p>

			<div class="flex justify-end gap-4">
				<button type="submit" class="bracket-link text-sm">Save Notes</button>
			</div>
		</form>
	</div>
</div>
