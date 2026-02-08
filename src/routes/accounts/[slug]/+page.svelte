<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import { onMount } from 'svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Delete confirmation modal state
	let showDeleteModal = $state(false);
	let balanceToDelete = $state<{ slug: string; date: string; balance: string } | null>(null);

	// Form submission feedback state
	let isSubmitting = $state(false);
	let submitMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

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

	// Open delete confirmation modal
	function openDeleteModal(balance: typeof data.balances[number]) {
		balanceToDelete = {
			slug: balance.slug,
			date: formatDate(balance.asOfDate),
			balance: formatCurrency(balance.balanceInCents)
		};
		showDeleteModal = true;
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

		// The input value is bound to balanceToDelete.slug, so it will be updated
		// Submit the form
		const deleteForm = document.getElementById('delete-balance-form') as HTMLFormElement;
		if (deleteForm) {
			deleteForm.requestSubmit();
		}
	}

	// Clear feedback message after 3 seconds
	$effect(() => {
		if (submitMessage) {
			const timeout = setTimeout(() => {
				submitMessage = null;
			}, 3000);
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

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">ACCOUNT DETAIL</h1>
</div>

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

	{#if submitMessage}
		<div class="mb-2 p-2 border border-black text-sm {submitMessage.type === 'error' ? 'bg-red-100' : 'bg-green-100'}">
			{submitMessage.text}
		</div>
	{/if}

	{#if form?.error}
		<div class="bg-amber-100 border border-black p-2 mb-2 text-sm">
			{@html form.error.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="bracket-link text-xs">[$1]</a>')}
		</div>
	{/if}

	<form
		method="POST"
		action="?/addBalance"
		use:enhance={() => {
			return async ({ result }) => {
				isSubmitting = true;
				// Result is handled by SvelteKit (redirect on success)
				isSubmitting = false;
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
		<button
			type="submit"
			disabled={isSubmitting}
			class="bg-black text-white px-4 py-1 text-sm font-bold hover:bg-gray-800 w-fit"
			class:opacity-50={isSubmitting}
		>
			{isSubmitting ? 'Adding...' : 'Add Balance'}
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
						<td class="text-right font-mono">{formatCurrency(balance.balanceInCents)}</td>
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
								href="/accounts/{data.account.slug}/balances/{balance.slug}/edit"
								class="bracket-link text-xs"
								>Edit</a
							>
							<span class="text-xs mx-1"> </span>
							<button
								type="button"
								onclick={() => openDeleteModal(balance)}
								class="text-xs text-red-700 hover:underline"
							>
								[Delete]
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
>
	<input type="hidden" name="balanceSlug" value={balanceToDelete?.slug ?? ''} />
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
