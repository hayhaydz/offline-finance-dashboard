<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import { onMount } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Delete confirmation modal state
	let showDeleteModal = $state(false);
	let balanceToDelete = $state<{ slug: string; date: string; balance: string } | null>(null);
	let deleteBalanceSlug = $state(''); // Reactive state for form input

	// Form submission feedback state
	let isSubmitting = $state(false);
	let submitMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Accordion state
	let addBalanceOpen = $state(false);

	// Get today's date in YYYY-MM-DD format for max attribute
	const today = new Date().toISOString().split('T')[0];

	// Format date for display
	function formatDate(date: Date): string {
		return formatDateShorthand(date);
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
			investment: 'Investment',
			'credit-card': 'Credit Card',
			loan: 'Loan',
			mortgage: 'Mortgage'
		};
		return types[type] || type;
	}

	// Calculate new offset for "Load more"
	function loadMoreUrl(): string {
		const currentOffset = new URLSearchParams(window.location.search).get('offset') || '0';
		const newOffset = parseInt(currentOffset) + 50;
		return `?offset=${newOffset}`;
	}

	// Open delete confirmation modal
	function openDeleteModal(balance: typeof data.balances[number]) {
		console.log('[openDeleteModal] Setting balanceToDelete to:', balance.slug, 'Date:', formatDate(balance.asOfDate));
		balanceToDelete = {
			slug: balance.slug,
			date: formatDate(balance.asOfDate),
			balance: formatCurrency(balance.balanceInCents)
		};
		deleteBalanceSlug = balance.slug; // Update form value immediately
		showDeleteModal = true;
		console.log('[openDeleteModal] balanceToDelete set to:', balanceToDelete.slug, 'deleteBalanceSlug:', deleteBalanceSlug);
	}

	// Cancel delete
	function cancelDelete() {
		showDeleteModal = false;
		balanceToDelete = null;
	}

	// Confirm delete - update form and submit
	function confirmDelete() {
		if (!balanceToDelete) return;

		showDeleteModal = false;
		isSubmitting = true;

		// Submit the form programmatically
		const deleteForm = document.getElementById('delete-balance-form') as HTMLFormElement;
		if (deleteForm) {
			deleteForm.requestSubmit();
		}
	}

	// Clear success messages after 10 seconds, errors persist until manually dismissed
	$effect(() => {
		if (submitMessage) {
			const timeout = setTimeout(() => {
				if (submitMessage?.type === 'success') {
					submitMessage = null;
				}
			}, 10000);
			return () => clearTimeout(timeout);
		}
	});

	// Show form submission result
	$effect(() => {
		if (form) {
			isSubmitting = false;
			if (form.error) {
				submitMessage = { type: 'error', text: form.error as string };
			}
		}
	});
</script>

<!-- ACCOUNT INFO HEADER -->
<div class="border-b border-black p-2">
	<div class="flex justify-between items-center mb-2">
		<h2 class="text-base font-bold m-0">{data.account.name}</h2>
		<div class="flex gap-2">
			<a href="/accounts/{data.account.slug}/edit" class="bracket-link text-xs">Edit</a>
			<a href="/accounts/{data.account.slug}/delete" class="bracket-link text-xs text-red-700">Close</a>
		</div>
	</div>
	<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
		<div>Type:</div>
		<div>{getAccountType(data.account.type)}</div>
		<div>Tax Wrapper:</div>
		<div>{data.account.taxWrapper === 'none' ? '-' : data.account.taxWrapper.toUpperCase()}</div>
		<div>Institution:</div>
		<div>{data.account.institution || '-'}</div>
		<div>Liquidity:</div>
		<div class="capitalize">{data.account.liquidity}</div>
		<div>Current Balance:</div>
		<div class="font-bold">{formatCurrency(data.currentBalance)}</div>
	</div>
</div>

<!-- ADD BALANCE FORM -->
{#if submitMessage}
	<div class="p-2 border-b border-black text-sm flex justify-between items-start {submitMessage.type === 'error' ? 'bg-red-100' : 'bg-green-100'}">
		<div class="flex-1">
			{@html submitMessage.text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">[$1]</a>')}
		</div>
		<button
			type="button"
			onclick={() => submitMessage = null}
			class="ml-2 text-xs bracket-link"
		>
			[Dismiss]
		</button>
	</div>
{/if}

{#if form?.error}
	<div class="bg-amber-100 border-b border-black p-2 text-sm">
		{@html form.error.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">[$1]</a>')}
	</div>
{/if}

<button
	type="button"
	class="w-full font-bold flex justify-between bg-gray-100 border-b border-black p-2 hover:bg-gray-200 transition-colors cursor-pointer"
	onclick={() => addBalanceOpen = !addBalanceOpen}
>
	<span>ADD BALANCE ENTRY</span>
	<span>{addBalanceOpen ? '[-]' : '[+]'}</span>
</button>

<div class="grid transition-[grid-template-rows] duration-300 ease-in-out border-b border-black overflow-hidden" style="grid-template-rows: {addBalanceOpen ? '1fr' : '0fr'};">
	<div class="min-h-0">
		<div class="p-2">
			<form
				method="POST"
				action="?/addBalance"
				use:enhance={() => {
					return async ({ formElement, result }) => {
						if (result.type === 'success') {
							// Show success message
							submitMessage = { type: 'success', text: (result.data as { success?: string }).success || 'Balance entry added' };
							// Clear the form after successful submission
							formElement.reset();
						} else if (result.type === 'failure' && result.data) {
							// Show error message
							const errorData = result.data as { error?: string };
							if (errorData.error) {
								submitMessage = { type: 'error', text: errorData.error };
							}
						}
						// Invalidate all page data to refresh the balance list
						await invalidateAll();
					};
				}}
				class="flex flex-col gap-2"
			>
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
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            class="bracket-link text-sm"
            class:opacity-50={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Balance'}
          </button>
        </div>
			</form>
		</div>
	</div>
</div>

<!-- BALANCE HISTORY TABLE -->
<div>
	{#if data.balances.length === 0}
		<p class="text-gray-600 text-xs">No balance history yet. Add your first entry above.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="pl-2 text-left">Date</th>
					<th class="text-right pr-1">Balance</th>
					<th class="text-right pr-1">Change</th>
					<th class="pl-2 text-left">Notes</th>
					<th class="text-right pr-1">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.balances as balance}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="pl-2 text-sm py-2">{formatDate(balance.asOfDate)}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2">{formatCurrency(balance.balanceInCents)}</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2">
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
						<td class="pl-2 text-sm py-2 text-gray-600">{balance.notes || '-'}</td>
						<td class="text-right pr-1 text-sm py-2">
							<a
								href="/accounts/{data.account.slug}/balances/{balance.slug}/edit"
								class="bracket-link text-xs"
							>Edit</a>
							<button
								type="button"
								onclick={() => openDeleteModal(balance)}
								class="bracket-link text-xs text-red-700"
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

<!-- DELETE BALANCE FORM (single form, triggered by modal) -->
<form
	method="POST"
	action="?/deleteBalance"
	class="hidden"
	id="delete-balance-form"
	use:enhance={() => {
		return async ({ result }) => {
			if (result.type === 'success') {
				// Show success message
				submitMessage = { type: 'success', text: (result.data as { success?: string }).success || 'Balance entry deleted' };
				// Navigate to current page to force fresh data fetch (bypasses browser cache)
				await goto('.', { invalidateAll: true });
			} else if (result.type === 'failure' && result.data) {
				// Show error message
				const errorData = result.data as { error?: string };
				if (errorData.error) {
					submitMessage = { type: 'error', text: errorData.error };
				}
			}
			isSubmitting = false;
		};
	}}
>
	<input type="hidden" name="balanceSlug" bind:value={deleteBalanceSlug} />
</form>

<!-- DELETE CONFIRMATION MODAL -->
{#if showDeleteModal && balanceToDelete}
	<ConfirmationModal
		title="Delete Balance Entry"
		message={`Are you sure you want to delete the balance entry for ${balanceToDelete.date} with amount ${balanceToDelete.balance}? This action cannot be undone.`}
		confirmText="Delete"
		cancelText="Cancel"
		onConfirm={confirmDelete}
		onCancel={cancelDelete}
	/>
{/if}
