<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Get display name for account type
	function getAccountTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			current: 'Current',
			savings: 'Savings',
			investment: 'Investment',
			'credit-card': 'Credit Card',
			loan: 'Loan',
			mortgage: 'Mortgage'
		};
		return labels[type] || type;
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">CLOSE ACCOUNT</h1>
</div>

<div class="p-2">
	<div class="bg-red-50 border-l-4 border-l-red-700 border border-black p-4 mb-4">
		<h2 class="font-bold text-red-900 mb-2">WARNING: You are about to close an account</h2>
		<p class="text-sm mb-2">
			Closing this account will hide it from the main accounts view, but <strong
				>all balance history will be preserved</strong
			>. You can still view the account details and historical data.
		</p>
		<p class="text-sm">
			This action <strong>cannot be undone</strong> through the interface. Contact support if you need
			to reopen a closed account.
		</p>
	</div>

	<div class="border border-black p-4 mb-4 bg-gray-50">
		<h3 class="font-bold mb-2">Account Summary</h3>
		<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
			<div>Name:</div>
			<div class="font-bold truncate">{truncateDisplay(data.account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</div>
			<div>Type:</div>
			<div>{getAccountTypeLabel(data.account.type)}</div>
			<div>Institution:</div>
			<div class="truncate">{truncateDisplay(data.account.institution || '-', DISPLAY_LIMITS.INSTITUTION_NAME)}</div>
			<div>Liquidity:</div>
			<div class="capitalize">{data.account.liquidity}</div>
		</div>
	</div>

	<form method="POST" action="?/closeAccount" use:enhance>
		<div class="flex gap-2">
			<button
				type="submit"
				class="bg-red-700 text-white px-4 py-2 text-sm font-bold hover:bg-red-800"
			>
				Yes, Close This Account
			</button>
			<a
				href="/accounts/{data.account.slug}"
				class="border border-black px-4 py-2 text-sm hover:bg-gray-100 no-underline text-black"
			>
				Cancel
			</a>
		</div>
	</form>

	<div class="mt-6 text-xs text-gray-600">
		<p class="font-bold mb-1">What happens when you close an account:</p>
		<ul class="list-disc pl-5 space-y-1">
			<li>The account will be hidden from the main accounts overview</li>
			<li>All balance history remains accessible via direct link</li>
			<li>The account will be marked with "(closed)" in database queries</li>
			<li>No new balance entries can be added</li>
			<li>The account is not permanently deleted from the database</li>
		</ul>
	</div>
</div>
