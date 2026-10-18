<script lang="ts">
	import { enhance } from '$app/forms';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Typed confirmation for the destructive delete (matches the
	// confirm-archive pattern: input must equal the account name)
	let nameInput = $state('');
	const confirmed = $derived(nameInput === data.account.name);

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
	<h1 class="text-lg font-bold mb-0 mt-0">CLOSE / DELETE ACCOUNT</h1>
</div>

<div class="p-2">
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<!-- CLOSE (reversible state change, history preserved) -->
	<div class="bg-red-50 border-l-4 border-l-red-700 border border-black p-4 mb-4">
		<h2 class="font-bold text-red-900 mb-2">CLOSE — hide this account, keep its history</h2>
		<p class="text-sm mb-2">
			Closing hides the account behind the <span class="font-mono text-xs">[Show N closed]</span> toggle on the
			accounts list, but <strong>all balance history is preserved</strong> and still counts in interest,
			ISA and tax-year breakdowns.
		</p>
		<p class="text-sm">
			Closing suits accounts you are <strong>done using</strong>. Use this for any account with transaction
			history.
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
			<div>Transactions:</div>
			<div>{data.transactionCount}</div>
		</div>
	</div>

	<form method="POST" action="?/closeAccount" use:enhance>
		<div class="flex gap-2">
			<button
				type="submit"
				class="bracket-link text-sm"
			>
				Close Account
			</button>
			<a
				href="/accounts/{data.account.slug}"
				class="bracket-link text-sm"
			>
				Cancel
			</a>
		</div>
	</form>

	<!-- DELETE (destructive, empty accounts only) -->
	{#if data.transactionCount === 0}
		<div id="delete-account" class="mt-6 border-2 border-black bg-white">
			<div class="bg-black text-white p-2 font-bold text-sm">
				DELETE — PERMANENTLY REMOVE THIS EMPTY ACCOUNT
			</div>
			<div class="p-4">
				<p class="text-sm mb-2">
					This account was created by mistake and has <strong>zero transactions</strong>. Deleting removes
					it permanently — it will no longer appear anywhere in the app.
				</p>
				<div class="border border-black p-2 mb-4 text-sm bg-gray-50">
					<div class="font-bold mb-1">Will be removed:</div>
					<ul class="list-disc pl-5">
						<li>The account row: <span class="font-bold">{truncateDisplay(data.account.name, DISPLAY_LIMITS.ACCOUNT_NAME)}</span></li>
						<li>{data.noteCount} note{data.noteCount === 1 ? '' : 's'}</li>
						<li>{data.rateCount} interest-rate histor{data.rateCount === 1 ? 'y entry' : 'y entries'}</li>
					</ul>
				</div>
				<p class="text-xs text-gray-600 mb-4">
					This cannot be undone. Nothing is kept — unlike closing, deleting erases the account and its notes/rates.
				</p>
				<form method="POST" action="?/deleteAccount" use:enhance>
					<div class="mb-4">
						<label for="delete-confirm-name" class="text-sm block mb-1">
							Type <span class="font-bold">{data.account.name}</span> to confirm:
						</label>
						<input
							type="text"
							id="delete-confirm-name"
							name="confirmName"
							bind:value={nameInput}
							autocomplete="off"
							class="border border-black p-1 text-sm font-mono w-full"
						/>
					</div>
					<div class="flex gap-2">
						<button
							type="submit"
							disabled={!confirmed}
							class="bracket-link text-sm text-red-700 font-bold border border-red-700 px-1 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							[Delete Account]
						</button>
					</div>
				</form>
			</div>
		</div>
	{:else}
		<div class="mt-6 border border-black p-2 text-xs text-gray-600 bg-gray-50">
			<span class="font-bold">Delete is unavailable:</span> accounts with transaction history
			({data.transactionCount} transaction{data.transactionCount === 1 ? '' : 's'} here) can only be
			closed — history is preserved.
		</div>
	{/if}

	<div class="mt-6 text-xs text-gray-600">
		<p class="font-bold mb-1">Close vs delete:</p>
		<ul class="list-disc pl-5 space-y-1">
			<li><span class="font-bold">Close</span> — done with the account; hidden from open lists, history kept and still counted in tax/interest totals</li>
			<li><span class="font-bold">Delete</span> — mistaken creation (zero transactions only); account, notes and rate history are permanently removed</li>
		</ul>
	</div>
</div>
