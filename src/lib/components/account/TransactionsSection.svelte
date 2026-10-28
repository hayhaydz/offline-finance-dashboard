<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { formatCurrency, formatDateShorthand, formatDateTime } from '$lib/utils/currency';
	import { truncateDisplay, DISPLAY_LIMITS } from '$lib/utils/fieldLimits';
	import { getTransactionTypeLabel, getTransactionTypeBadgeClass } from '$lib/utils/formatting';
	import {
		adjacentMonths,
		filterGroupsByType,
		groupTransactionsByMonth,
		monthLabelForKey,
	} from '$lib/utils/transaction-grouping';
	import type { useSubmitFeedback } from '$lib/utils/use-submit-feedback.svelte';
	import {
		TRANSACTION_TYPE_HELP,
		TRANSACTION_TYPE_LABELS,
		getTransactionTypesForAccountType,
		type TransactionType,
	} from '$lib/utils/domain-constants';

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
		accountType,
		transactions,
		categories,
		recurringPatterns,
		closedAt,
		typeFilter = null,
		onClearTypeFilter = undefined,
		editMode = $bindable(false),
		addTransactionOpen = $bindable(false),
		feedback,
		monthNav,
		sectionRef,
		today,
	}: {
		accountSlug: string;
		accountType: string;
		transactions: Transaction[];
		categories: Category[];
		recurringPatterns: RecurringPattern[] | null;
		closedAt: Date | null;
		typeFilter?: TransactionType | null;
		onClearTypeFilter?: () => void;
		editMode: boolean;
		addTransactionOpen: boolean;
		feedback: ReturnType<typeof useSubmitFeedback>;
		monthNav: {
			months: string[]; // data-bearing months, newest → oldest
			currentMonth: string | null;
			updateMonth: (monthKey: string | null) => void | Promise<void>;
		};
		sectionRef: HTMLElement | null;
		today: string;
	} = $props();

	// Creator type options — single-sourced from TRANSACTION_TYPES via the
	// per-account-type filter map (permissive for unknown account types).
	const creatableTypes: readonly TransactionType[] = $derived(
		getTransactionTypesForAccountType(accountType),
	);

	// Styled delete confirmation (P2-2) — replaces native confirm(). The
	// pending transaction gates the modal; confirming submits its form.
	let pendingDelete: Transaction | null = $state(null);
	function confirmDelete() {
		const slug = pendingDelete?.slug;
		pendingDelete = null;
		if (slug) {
			document
				.querySelector<HTMLFormElement>(`form[data-delete-tx="${slug}"]`)
				?.requestSubmit();
		}
	}
	// Track the user's choice; fall back to the first offered type when unset
	// or no longer offered (keeps the select valid if the list ever changes).
	let selectedType = $state<TransactionType | null>(null);
	const effectiveType: TransactionType = $derived(
		selectedType !== null && creatableTypes.includes(selectedType)
			? selectedType
			: creatableTypes[0],
	);
	const selectedTypeHelp = $derived(TRANSACTION_TYPE_HELP[effectiveType]);

	const transactionGroups = $derived(
		groupTransactionsByMonth(
			transactions,
			(tx) => new Date(tx.transactionDate),
			(tx) => tx.amount,
		)
	);

	// Display-only type prefilter (`?type=` from alert deep links):
	// narrows the rendered rows but keeps each month header's totals
	// computed from the full month (filterGroupsByType preserves them).
	const displayedGroups = $derived(
		filterGroupsByType(transactionGroups, typeFilter ?? null)
	);

	function formatDate(date: Date): string {
		return formatDateShorthand(date);
	}

	// Prev = previous data-bearing month (older); Next = next data-bearing
	// month (newer). Empty months are absent from the list, so they're skipped.
	const adjacent = $derived(adjacentMonths(monthNav.months, monthNav.currentMonth));

	async function goToMonth(monthKey: string | null) {
		await monthNav.updateMonth(monthKey);
		await tick();
		if (sectionRef) {
			const rect = sectionRef.getBoundingClientRect();
			const isOutOfView = rect.top < 0 || rect.bottom > window.innerHeight;
			if (isOutOfView) {
				sectionRef.scrollIntoView({ behavior: 'instant', block: 'start' });
			}
		}
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
				use:enhance={feedback.createEnhanceHandler("Transaction added successfully", { resetForm: true, onSuccess: () => { selectedType = null; addTransactionOpen = false; } })}
				class="flex flex-col gap-2"
			>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="type" class="block text-sm font-bold mb-1">Type</label>
						<select
							id="type"
							name="type"
							value={effectiveType}
							onchange={(e) => { selectedType = e.currentTarget.value as TransactionType; }}
							required
							class="w-full border border-black px-2 py-1 text-sm bg-white"
						>
							{#each creatableTypes as txType (txType)}
								<option value={txType}>{TRANSACTION_TYPE_LABELS[txType]}</option>
							{/each}
						</select>
						{#if selectedTypeHelp}
							<div class="text-xs text-gray-500 mt-1">{selectedTypeHelp}</div>
						{/if}
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

	<!-- Active type prefilter chip (alert deep links): visible + clearable -->
	{#if typeFilter}
		<div class="border-b border-black px-2 py-1 bg-amber-100 text-xs flex items-center gap-2">
			<span class="font-bold">[Type: {typeFilter}]</span>
			<button type="button" class="bracket-link" onclick={() => onClearTypeFilter?.()}>
				[Clear]
			</button>
			<span class="text-zinc-500">month totals include all rows</span>
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
				{#each displayedGroups as group}
					<!-- Month header row — totals always full-month, even when rows are prefiltered -->
					<tr class="bg-gray-100 border-b border-gray-300">
						<td colspan={editMode ? 7 : 6} class="pl-2 py-1 text-xs font-bold">
							{group.monthLabel} — {group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}{#if typeFilter} shown{/if}
							<span class="text-gray-400 font-normal"> · Net: </span>
							<span class="{group.net >= 0 ? 'text-green-700' : 'text-red-700'}">{group.net >= 0 ? '+' : ''}{formatCurrency(group.net)}</span>
							<span class="text-gray-400 font-normal"> ({formatCurrency(group.inflow)} in, {formatCurrency(group.outflow)} out)</span>
						</td>
					</tr>
					{#if group.transactions.length === 0}
						<tr class="border-b border-gray-200">
							<td colspan={editMode ? 7 : 6} class="pl-2 py-1 text-xs text-gray-500">
								No {typeFilter} transactions this month.
							</td>
						</tr>
					{:else}
					{#each group.transactions as transaction}
							<tr class="border-b border-gray-200 last:border-b-0 align-top">
								{#if editMode}
									<td class="pl-2 text-sm py-2 whitespace-nowrap">
										{#if !closedAt}
											<form
												method="POST"
												action="?/deleteTransaction"
												class="inline"
												data-delete-tx={transaction.slug}
												use:enhance={feedback.createEnhanceHandler('Transaction deleted')}
												>
												<input type="hidden" name="transactionSlug" value={transaction.slug} />
												<button
													type="button"
													class="bracket-link text-xs text-red-700"
													onclick={() => { pendingDelete = transaction; }}
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
					{/if}
				{/each}
			</tbody>
			</table>
		</div>
		{#if monthNav.months.length > 1}
			<div class="border-t border-black p-2 flex gap-2 items-center text-sm">
				{#if adjacent.prev}
					<button
						type="button"
						class="bracket-link"
						onclick={() => goToMonth(adjacent.prev)}
					>
						[Prev]
					</button>
				{/if}
				<select
					aria-label="Jump to month"
					class="border border-black px-1 py-0.5 text-xs bg-white"
					value={monthNav.currentMonth ?? ''}
					onchange={(e) => goToMonth(e.currentTarget.value)}
				>
					{#each monthNav.months as monthKey (monthKey)}
						<option value={monthKey}>{monthLabelForKey(monthKey)}</option>
					{/each}
				</select>
				{#if adjacent.next}
					<button
						type="button"
						class="bracket-link"
						onclick={() => goToMonth(adjacent.next)}
					>
						[Next]
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<ConfirmModal
	open={pendingDelete !== null}
	title="DELETE TRANSACTION"
	message="Delete this transaction?"
	details={pendingDelete ? [
		`Date: ${formatDateShorthand(pendingDelete.transactionDate)}`,
		`Amount: ${formatCurrency(pendingDelete.amount)}`,
		pendingDelete.description ? `Description: ${truncateDisplay(pendingDelete.description, DISPLAY_LIMITS.BALANCE_NOTES)}` : null
	].filter((d): d is string => d !== null) : undefined}
	confirmLabel="[Delete]"
	onConfirm={confirmDelete}
	onCancel={() => (pendingDelete = null)}
/>
