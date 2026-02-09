<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const VALID_ACCOUNT_TYPES = ['current', 'savings', 'investment', 'credit-card', 'loan', 'mortgage'];
	const VALID_TAX_WRAPPERS = ['none', 'isa', 'lisa'];
	const VALID_LIQUIDITY_VALUES = ['instant', 'delayed', 'locked'];

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

	// Get display name for tax wrapper
	function getTaxWrapperLabel(taxWrapper: string): string {
		const labels: Record<string, string> = {
			none: 'None',
			isa: 'ISA',
			lisa: 'LISA'
		};
		return labels[taxWrapper] || taxWrapper;
	}

	// Get display name for liquidity
	function getLiquidityLabel(liquidity: string): string {
		const labels: Record<string, string> = {
			instant: 'Instant access',
			delayed: 'Notice period',
			locked: 'Fixed term'
		};
		return labels[liquidity] || liquidity;
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">EDIT ACCOUNT</h1>
</div>

<div class="p-2">
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<form method="POST" action="?/updateAccount" use:enhance class="flex flex-col gap-4">
		<div>
			<label for="name" class="block text-sm font-bold mb-1">Account Name *</label>
			<input
				type="text"
				id="name"
				name="name"
				value={data.account.name}
				required
				class="w-full max-w-md border border-black px-2 py-1 text-sm"
			/>
		</div>

		<div>
			<span class="block text-sm font-bold mb-1">Account Type *</span>
			<div class="flex flex-col gap-1">
				{#each VALID_ACCOUNT_TYPES as typeOption}
					<label class="flex items-center gap-1">
						<input
							type="radio"
							name="type"
							value={typeOption}
							checked={data.account.type === typeOption}
							required
						/>
						<span class="text-sm">{getAccountTypeLabel(typeOption)}</span>
					</label>
				{/each}
			</div>
		</div>

		<div>
			<span class="block text-sm font-bold mb-1">Tax Wrapper *</span>
			<div class="flex flex-col gap-1">
				{#each VALID_TAX_WRAPPERS as wrapperOption}
					<label class="flex items-center gap-1">
						<input
							type="radio"
							name="taxWrapper"
							value={wrapperOption}
							checked={data.account.taxWrapper === wrapperOption}
							required
						/>
						<span class="text-sm">{getTaxWrapperLabel(wrapperOption)}</span>
					</label>
				{/each}
			</div>
		</div>

		<div>
			<label for="institution" class="block text-sm font-bold mb-1">Institution</label>
			<input
				type="text"
				id="institution"
				name="institution"
				value={data.account.institution || ''}
				class="w-full max-w-md border border-black px-2 py-1 text-sm"
			/>
			<div class="text-xs text-gray-600 mt-1">Optional: Bank or financial institution name</div>
		</div>

		<div>
			<label for="liquidity" class="block text-sm font-bold mb-1">Liquidity *</label>
			<select
				id="liquidity"
				name="liquidity"
				required
				class="w-full max-w-md border border-black px-2 py-1 text-sm"
			>
				{#each VALID_LIQUIDITY_VALUES as liquidity}
					<option value={liquidity} selected={data.account.liquidity === liquidity}>
						{getLiquidityLabel(liquidity)}
					</option>
				{/each}
			</select>
			<div class="text-xs text-gray-600 mt-1">How quickly can you access this money?</div>
		</div>

		<div class="flex gap-2 mt-4">
			<button
				type="submit"
				class="bg-black text-white px-4 py-2 text-sm font-bold hover:bg-gray-800"
			>
				Update Account
			</button>
			<a
				href="/accounts/{data.account.slug}"
				class="border border-black px-4 py-2 text-sm hover:bg-gray-100 no-underline text-black"
			>
				Cancel
			</a>
		</div>
	</form>

	<div class="mt-8 pt-4 border-t border-black">
		<p class="text-sm text-gray-600 mb-2">Need to remove this account?</p>
		<a href="/accounts/{data.account.slug}/delete" class="bracket-link text-sm text-red-700">
			Close Account
		</a>
		<div class="text-xs text-gray-500 mt-1">
			Closing an account hides it from the main view but preserves all balance history.
		</div>
	</div>
</div>
