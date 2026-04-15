<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDateShorthand, formatDateTime } from '$lib/utils/currency';
	import { truncateDisplay, DISPLAY_LIMITS } from '$lib/utils/fieldLimits';
	import { getTransactionTypeLabel, getTransactionTypeBadgeClass } from '$lib/utils/formatting';
	import { groupTransactionsByMonth } from '$lib/utils/transaction-grouping';
	import PaginationClient from '$lib/components/PaginationClient.svelte';
	import type { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';
	import type { TransactionType } from '$lib/utils/domain-constants';

	type Category = { id: number; name: string; colour: string };
	type Transaction = {
		slug: string;
		transactionDate: Date;
		type: TransactionType;
		amount: number;
		description: string | null;
		category: Category | null;
	};
	type RecurringPattern = {
		description: string;
		approximateAmount: number;
		lastDate: Date;
	};

	let {
		accountSlug,
		transactions,
		categories,
		recurringPatterns,
		closedAt,
		editMode,
		addTransactionOpen,
		feedback,
		pagination,
		totalPages,
		sectionRef,
		today,
	}: {
		accountSlug: string;
		transactions: Transaction[];
		categories: Category[];
		recurringPatterns: RecurringPattern[] | null;
		closedAt: Date | null;
		editMode: boolean;
		addTransactionOpen: boolean;
		feedback: ReturnType<typeof useSubmitFeedback>;
		pagination: { page: number; updatePage: (p: number) => Promise<void> };
		totalPages: number;
		sectionRef: HTMLElement | null;
		today: string;
	} = $props();

	const transactionGroups = $derived(
		groupTransactionsByMonth(
			transactions,
			(tx) => new Date(tx.transactionDate),
			(tx) => tx.amount,
		)
	);

	function formatDate(date: Date): string {
		return formatDateShorthand(date);
	}
</script>

<div bind:this={sectionRef} class="border-t border-black">
	<div class="border-b border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
		<span>TRANSACTIONS</span>
    <div>
      {#if !closedAt}
        <button
          type="button"
          class="bracket-link text-xs"
          onclick={() => editMode = !editMode}
        >
          {editMode ? '[Done]' : '[Edit]'}
        </button>
        <button
          type="button"
          class="bracket-link text-xs"
          onclick={() => addTransactionOpen = !addTransactionOpen}
        >
          {addTransactionOpen ? '[Cancel]' : '[Add Transaction]'}
        </button>
      {/if}
    </div>
	</div>

	{#if addTransactionOpen && !closedAt}
		<div class="border-b border-black p-2 bg-gray-50">
			<form
				method="POST"
				action="?/addTransaction"
				use:enhance={feedback.createEnhanceHandler("Transaction added successfully", { resetForm: true, onSuccess: () => { addTransactionOpen = false; } })}
				class="flex flex-col gap-2"
			>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="type" class="block text-sm font-bold mb-1">Type</label>
						<select
							id="type"
							name="type"
							required
							class="w-full border border-black px-2 py-1 text-sm"
						>
							<option value="deposit">Deposit</option>
							<option value="withdrawal">Withdrawal</option>
							<option value="interest">Interest</option>
							<option value="dividend">Dividend</option>
							<option value="value_change">Value Change</option>
							<option value="transfer_in">Transfer In</option>
							<option value="transfer_out">Transfer Out</option>
						</select>
					</div>
					<div>
						<label for="amount" class="block text-sm font-bold mb-1">Amount (£)</label>
						<input
							type="text"
							id="amount"
							name="amount"
							placeholder="123.45"
							required
							class="w-full border border-black px-2 py-1 text-sm font-mono"
						/>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="transactionDate" class="block text-sm font-bold mb-1">Date</label>
						<input
							type="date"
							id="transactionDate"
							name="transactionDate"
							value={today}
							max={today}
							required
							class="w-full border border-black px-2 py-1 text-sm"
						/>
					</div>
					<div>
						<label for="categoryId" class="block text-sm font-bold mb-1">Category</label>
						<select
							id="categoryId"
							name="categoryId"
							class="w-full border border-black px-2 py-1 text-sm font-mono bg-white"
						>
							<option value="">None</option>
							{#each categories as cat}
								<option value={cat.id}>
									{cat.name}
								</option>
							{/each}
						</select>
					</div>
				</div>
				<div>
					<label for="description" class="block text-sm font-bold mb-1">Description (optional)</label>
					<input
						type="text"
						id="description"
						name="description"
						placeholder="Transaction details..."
						class="w-full border border-black px-2 py-1 text-sm font-mono"
					/>
				</div>
				<div>
					<button
						type="submit"
						disabled={feedback.isSubmitting}
						class="bracket-link text-sm"
						class:opacity-50={feedback.isSubmitting}
					>
						{feedback.isSubmitting ? 'Adding...' : 'Add Transaction'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Recurring Transaction Patterns -->
	{#if recurringPatterns && recurringPatterns.length > 0}
		<div class="border-b border-black px-2 py-1 bg-gray-50">
			{#each recurringPatterns as pattern}
				<div class="text-xs text-gray-600">
					"{pattern.description}" appears monthly (~£{(pattern.approximateAmount / 100).toFixed(2)}). Last entry: {new Date(pattern.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
				</div>
			{/each}
		</div>
	{/if}

	{#if transactions.length === 0}
		<p class="text-gray-600 text-xs p-2">No transactions recorded yet.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full table-fixed min-w-[800px]">
				<thead>
					<tr>
						{#if editMode}
						<th class="pl-2 text-left whitespace-nowrap w-28">Actions</th>
						{/if}
						<th class="pl-2 text-left whitespace-nowrap w-28">Date</th>
						<th class="text-left whitespace-nowrap w-36">Type</th>
						<th class="text-left whitespace-nowrap w-28">Category</th>
						<th class="text-right pr-1 whitespace-nowrap w-36">Amount</th>
						<th class="pl-2 text-left w-sm">Description</th>
					</tr>
				</thead>
				<tbody>
					{#each transactionGroups as group}
						<!-- Month header row -->
						<tr class="bg-gray-100 border-b border-gray-300">
							<td colspan={editMode ? 7 : 6} class="pl-2 py-1 text-xs font-bold">
								{group.monthLabel} — {group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}
								<span class="text-gray-400 font-normal"> · Net: </span>
								<span class="{group.net >= 0 ? 'text-green-700' : 'text-red-700'}">{group.net >= 0 ? '+' : ''}{formatCurrency(group.net)}</span>
								<span class="text-gray-400 font-normal"> ({formatCurrency(group.inflow)} in, {formatCurrency(group.outflow)} out)</span>
							</td>
						</tr>
						{#each group.transactions as transaction}
							<tr class="border-b border-gray-200 last:border-b-0 align-top">
								{#if editMode}
									<td class="pl-2 text-sm py-2 whitespace-nowrap">
										{#if !closedAt}
											<form
												method="POST"
												action="?/deleteTransaction"
												class="inline"
												use:enhance={feedback.createEnhanceHandler('Transaction deleted')}
												>
												<input type="hidden" name="transactionSlug" value={transaction.slug} />
												<button
													type="submit"
													class="bracket-link text-xs text-red-700"
													onclick={(e) => { if (!confirm('Delete this transaction?')) e.preventDefault(); }}
												>
													[Delete]
												</button>
											</form>
										{/if}
									</td>
								{/if}
								<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDate(transaction.transactionDate)}</td>
								<td class="text-sm py-2 whitespace-nowrap">
									<span class="px-1 text-xs {getTransactionTypeBadgeClass(transaction.type)}">
										{getTransactionTypeLabel(transaction.type)}
									</span>
								</td>
								<td class="text-sm py-2 whitespace-nowrap">
									{#if transaction.category}
										<span
											class="px-1 text-xs"
											style="background-color: {transaction.category.colour}20; color: #000"
										>
											{transaction.category.name}
										</span>
									{/if}
								</td>
								<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
									<span class={transaction.amount >= 0 ? 'text-green-700' : 'text-red-700'}>
										{transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}
									</span>
								</td>
								<td class="pl-2 text-sm py-2 text-gray-600 break-words">
									{truncateDisplay(transaction.description || '-', DISPLAY_LIMITS.BALANCE_NOTES)}
								</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
		<div class="border-t border-black empty:hidden">
			<PaginationClient page={pagination.page} totalPages={totalPages} onPageChange={pagination.updatePage} scrollTarget={sectionRef} />
		</div>
	{/if}
</div>
