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
	const accountsByType = $derived(() => {
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
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">CREATE SNAPSHOT</h1>
</div>

<!-- HEADER WITH ACTIONS -->
<div class="border-b border-black p-2">
	<div class="flex justify-between items-center">
		<h2 class="text-base font-bold m-0 leading-none">New Snapshot</h2>
		<div class="flex gap-2">
			<button type="submit" form="snapshot-form" class="bracket-link text-xs">Create Snapshot</button>
			<a href="/overview/snapshots" class="bracket-link text-xs">Cancel</a>
		</div>
	</div>
</div>

<form method="POST" use:enhance id="snapshot-form">
	<!-- SNAPSHOT DATE -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2 mb-2">
			SNAPSHOT DATE
		</div>
		<div class="p-2 pt-0">
			<input
				type="date"
				id="snapshotDate"
				name="snapshotDate"
				value={data.defaultDate}
				required
				class="border border-black p-1 text-sm focus:outline-none"
			/>
			<p class="text-xs text-gray-600 mt-1 mb-0">Default is today. Edit if needed.</p>
		</div>
	</div>

	<!-- FINANCIAL SUMMARY PREVIEW -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			FINANCIAL SUMMARY
		</div>
		<div class="p-2 pt-0 text-sm">
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Net Worth:</span>
				<span class="font-bold">{formatCurrencyShorthand(data.preview.netWorth)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Total Assets:</span>
				<span>{formatCurrencyShorthand(data.preview.totalAssets)}</span>
			</div>
			<div class="flex justify-between py-1 border-b border-gray-200 last:border-0">
				<span class="text-gray-600">Total Liabilities:</span>
				<span>{formatCurrencyShorthand(data.preview.totalLiabilities)}</span>
			</div>
			<div class="flex justify-between py-1 last:border-0">
				<span class="text-gray-600">Total Allocated:</span>
				<span>{formatCurrencyShorthand(data.preview.totalAllocated)}</span>
			</div>
		</div>
	</div>

	<!-- ACCOUNTS PREVIEW -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			ACCOUNTS ({data.preview.accountsBreakdown.accounts.length})
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

	<!-- GOALS PREVIEW -->
	<div class="border-b border-black">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			GOALS ({data.preview.goalsBreakdown.goals.length})
		</div>
		<div class="p-2">
			{#each data.preview.goalsBreakdown.goals as goal}
				<div class="text-xs flex justify-between py-1 border-b border-gray-200 last:border-0">
					<span>{truncateDisplay(goal.name, DISPLAY_LIMITS.GOAL_NAME)}</span>
					<span>
						{formatCurrencyShorthand(goal.currentAllocation)} /
						{formatCurrencyShorthand(goal.targetAmountInCents)}
					</span>
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
		<div class="p-2 text-xs text-gray-600">ISA allowance data unavailable.</div>
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
		<div class="p-2 text-xs text-gray-600">Interest breakdown data unavailable.</div>
		{/if}
	</div>
	{/if}

	<!-- NOTES -->
	<div class="">
		<div class="font-bold bg-gray-100 border-b border-black p-2">
			NOTES (OPTIONAL)
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
</form>
