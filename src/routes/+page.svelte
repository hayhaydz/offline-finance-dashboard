<script lang="ts">
	import { page } from '$app/stores';

	$: user = $page.data.user;
	$: env = $page.data.environment;

	// Placeholder net worth data (will be replaced with real data in Phase 2)
	const netWorth = {
		total: 123456.00,
		change: 2340.50,
		sinceDate: 'Jan 2026',
		assets: 156000.00,
		liabilities: -32544.00
	};

	// Placeholder accounts data
	const accounts = [
		{ name: 'Barclays Current', type: 'Current', balance: 5400 },
		{ name: 'Trading 212 ISA', type: 'Invest', balance: 45200 }
	];
</script>

{#if !user}
	<!-- Logged out state - terminal style welcome -->
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-2 mt-0">
			OFFLINE FINANCE DASHBOARD
		</h1>
		<p class="text-gray-600 my-1">
			Your trustworthy net worth at a glance.
		</p>
	</div>

	<div class="border-b border-black p-2">
		<div class="mb-2">
			<a href="/register" class="bracket-link">Create Account</a>
			<a href="/login" class="bracket-link">Log In</a>
			{#if env?.mode === 'development'}
				<a href="/dev-login" class="bracket-link text-amber-700 font-bold">[Dev Auto-Login]</a>
			{/if}
		</div>
	</div>

	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">SECURITY FEATURES</div>
	<div class="border-b border-black p-2">
		<div class="flex justify-between my-1"><span>End-to-end encryption</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>TOTP authentication</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Argon2id hashing</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Row-level security</span><span class="text-green-700 font-bold">Active</span></div>
		<div class="flex justify-between my-1"><span>Offline-first</span><span class="text-green-700 font-bold">Active</span></div>
	</div>
{:else}
	<!-- NET WORTH SECTION -->
	<div class="border-b border-black p-2">
		<div class="flex justify-between my-1">
			<span class="text-lg font-bold">NET WORTH</span>
			<span class="text-lg font-bold">
				£{netWorth.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
				{#if netWorth.change >= 0}
					↑
				{:else}
					↓
				{/if}
			</span>
		</div>
		<div class="flex justify-between my-1 text-gray-600 text-xs">
			<span>(incl. liabilities)</span>
			<span>since {netWorth.sinceDate}</span>
		</div>
	</div>

	<!-- SUMMARY SECTION -->
	<div class="border-b border-black p-2">
		<div class="flex justify-between my-1">
			<span>Assets</span>
			<span>£{netWorth.assets.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
		</div>
		<div class="flex justify-between my-1">
			<span>Liabilities</span>
			<span class="text-red-700 font-bold">
				£{netWorth.liabilities.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			</span>
		</div>
	</div>

	<!-- GOALS SECTION (placeholder for future implementation) -->
	<div class="border-b border-black p-2">
		<div class="mb-1 font-bold">SAVINGS GOALS</div>
		<div class="flex justify-between my-1">
			<span class="text-gray-600">[Goals not yet implemented]</span>
		</div>
		<div class="mt-2">
			<span class="bracket-link">Update Balances</span>
			<span class="bracket-link">Create Snapshot</span>
		</div>
	</div>

	<!-- ACCOUNTS OVERVIEW -->
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">ACCOUNTS OVERVIEW</div>
	<div class="p-0">
		<table>
			<thead>
				<tr>
					<th>Account</th>
					<th>Type</th>
					<th class="text-right">Balance</th>
				</tr>
			</thead>
			<tbody>
				{#each accounts as account}
					<tr>
						<td>{account.name}</td>
						<td>{account.type}</td>
						<td class="text-right">
							£{account.balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="px-2 py-1">
			<a href="/accounts" class="bracket-link">View All</a>
		</div>
	</div>
{/if}
