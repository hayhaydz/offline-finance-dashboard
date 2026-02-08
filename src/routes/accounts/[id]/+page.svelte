<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Get today's date in YYYY-MM-DD format for max attribute
	const today = new Date().toISOString().split('T')[0];

	// Format date for display
	function formatDate(date: Date): string {
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Format date for input value (YYYY-MM-DD)
	function formatDateForInput(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	// Get account type display name
	function getAccountType(type: string): string {
		const types: Record<string, string> = {
			current: 'Current',
			savings: 'Savings',
			credit: 'Credit',
			investment: 'Investment',
			ISA: 'ISA',
			LISA: 'LISA'
		};
		return types[type] || type;
	}

	// Calculate new offset for "Load more"
	function loadMoreUrl(): string {
		const currentOffset = new URLSearchParams(window.location.search).get('offset') || '0';
		const newOffset = parseInt(currentOffset) + 50;
		return `?offset=${newOffset}`;
	}

	// Handle delete confirmation
	document.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;
		if (target.classList.contains('delete-balance-link')) {
			e.preventDefault();
			const balanceId = target.getAttribute('data-balance-id');
			const form = document.getElementById(`delete-balance-${balanceId}`) as HTMLFormElement;
			if (form && confirm('Are you sure you want to delete this balance entry?')) {
				form.submit();
			}
		}
	});
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">ACCOUNT DETAIL</h1>
</div>

<!-- ACCOUNT INFO HEADER -->
<div class="border-b border-black p-2">
	<div class="flex justify-between items-center mb-2">
		<h2 class="text-base font-bold m-0">{data.account.name}</h2>
		<div class="flex gap-2">
			<a href="/accounts/{data.account.id}/edit" class="bracket-link text-xs">Edit</a>
			<a href="/accounts/{data.account.id}/delete" class="bracket-link text-xs text-red-700">Close</a>
		</div>
	</div>
	<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
		<div>Type:</div>
		<div>{getAccountType(data.account.type)}</div>
		<div>Institution:</div>
		<div>{data.account.institution || '-'}</div>
		<div>Liquidity:</div>
		<div class="capitalize">{data.account.liquidity}</div>
		<div>Current Balance:</div>
		<div class="font-bold">{formatCurrency(data.currentBalance)}</div>
	</div>
</div>

<!-- ADD BALANCE FORM -->
<div class="border-b border-black p-2">
	<h3 class="font-bold mb-2 mt-0">ADD BALANCE ENTRY</h3>

	{#if form?.error && form?.error.includes('already exists')}
		<div class="bg-amber-100 border border-black p-2 mb-2 text-sm">
			<span class="font-bold text-amber-900">WARNING:</span> {form.error}
			<div class="mt-1 text-xs">The existing entry will be replaced if you submit again.</div>
		</div>
	{:else if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-2 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<form method="POST" action="?/addBalance" use:enhance class="flex flex-col gap-2">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="balance" class="block text-sm font-bold mb-1">Balance</label>
				<input
					type="text"
					id="balance"
					name="balance"
					placeholder="123.45"
					required
					class="w-full border border-black px-2 py-1 text-sm font-mono"
				/>
			</div>
			<div>
				<label for="asOfDate" class="block text-sm font-bold mb-1">As-of Date</label>
				<input
					type="date"
					id="asOfDate"
					name="asOfDate"
					value={today}
					max={today}
					required
					class="w-full border border-black px-2 py-1 text-sm"
				/>
			</div>
		</div>
		<div>
			<label for="notes" class="block text-sm font-bold mb-1">Notes (optional)</label>
			<textarea
				id="notes"
				name="notes"
				rows="2"
				class="w-full border border-black px-2 py-1 text-sm font-mono"
			></textarea>
		</div>
		<button
			type="submit"
			class="bg-black text-white px-4 py-1 text-sm font-bold hover:bg-gray-800 w-fit"
		>
			Add Balance
		</button>
	</form>
</div>

<!-- BALANCE HISTORY TABLE -->
<div class="border-b border-black p-2">
	<h3 class="font-bold mb-2 mt-0">BALANCE HISTORY</h3>

	{#if data.balances.length === 0}
		<p class="text-gray-600 text-xs">No balance history yet. Add your first entry above.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Date</th>
					<th class="text-right">Balance</th>
					<th class="text-right">Change</th>
					<th>Notes</th>
					<th class="text-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.balances as balance}
					<tr>
						<td>{formatDate(balance.asOfDate)}</td>
						<td class="text-right font-mono">{formatCurrency(balance.balance)}</td>
						<td class="text-right font-mono">
							{#if balance.changeFromPrevious !== null}
								<span
									class={balance.changeFromPrevious >= 0
										? 'text-green-700'
										: 'text-red-700'}
								>
									{balance.changeFromPrevious >= 0 ? '+' : ''}
									{formatCurrency(balance.changeFromPrevious)}
								</span>
							{:else}
								<span class="text-gray-500">-</span>
							{/if}
						</td>
						<td class="text-xs text-gray-600">{balance.notes || '-'}</td>
						<td class="text-right">
							<a
								href="/accounts/{data.account.id}/balances/{balance.id}/edit"
								class="bracket-link text-xs">Edit</a
							>
							<span class="text-xs mx-1"> </span>
							<button
								type="button"
								class="delete-balance-link text-xs text-red-700 hover:underline"
								data-balance-id={balance.id}
							>
								Delete
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if data.hasMore}
			<div class="mt-2">
				<a href={loadMoreUrl()} class="bracket-link text-sm">Load older entries</a>
			</div>
		{/if}
	{/if}
</div>

<!-- DELETE BALANCE FORMS (hidden, triggered by buttons) -->
{#each data.balances as balance}
	<form method="POST" action="?/deleteBalance" class="hidden" id="delete-balance-{balance.id}">
		<input type="hidden" name="balanceId" value={balance.id} />
	</form>
{/each}
