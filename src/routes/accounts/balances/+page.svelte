<script lang="ts">
	import { enhance } from "$app/forms";
	import SubmitFeedback from "$lib/components/SubmitFeedback.svelte";
	import { formatCurrency, formatDateShorthand } from "$lib/utils/currency";
	import { useSubmitFeedback } from "$lib/utils/use-submit-feedback.svelte";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const feedback = useSubmitFeedback();

	const staleCount = $derived(data.accounts.filter((a) => a.stale).length);
</script>

<div class="max-w-4xl mx-auto p-4 font-mono">
	<div class="border border-black">
		<div class="border-b border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
			<span>BULK BALANCE UPDATE</span>
			<a class="bracket-link text-xs" href="/accounts">[Back to accounts]</a>
		</div>

		<div class="p-2 text-xs border-b border-black bg-gray-50">
			{data.accounts.length} open account{data.accounts.length !== 1 ? "s" : ""}
			{#if staleCount > 0}
				<span class="text-amber-700 font-bold"> · {staleCount} stale (35+ days)</span>
			{/if}
			<span class="text-gray-500"> · enter a target balance to reconcile — a correcting transaction is appended, balances are never overwritten</span>
		</div>

		<SubmitFeedback message={feedback.message} onDismiss={feedback.dismiss} />
		{#if form?.error}
			<div class="border-b border-black px-2 py-1 text-xs text-red-700 font-bold">
				[!] {form.error}
			</div>
		{/if}

		<form
			method="POST"
			action="?/update"
			use:enhance={feedback.createEnhanceHandler("Balances updated")}
		>
			<div class="flex items-center gap-2 p-2 border-b border-black text-sm">
				<label for="balanceDate" class="text-xs font-bold">AS OF</label>
				<input
					type="date"
					id="balanceDate"
					name="balanceDate"
					value={data.today}
					max={data.today}
					class="border border-black px-2 py-1 text-sm bg-white"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full table-fixed min-w-[760px]">
					<thead>
						<tr class="bg-gray-100 border-b border-black">
							<th class="pl-2 text-left w-48">Account</th>
							<th class="text-left w-28">Type</th>
							<th class="text-left w-28">Last activity</th>
							<th class="text-right pr-1 w-32">Current</th>
							<th class="text-right pr-2 w-36">New balance £</th>
						</tr>
					</thead>
					<tbody>
						{#each data.accounts as account (account.id)}
							<tr class="border-b border-gray-200">
								<td class="pl-2 text-sm py-2 break-words">
									{account.name}
									{#if account.stale}
										<span class="inline-block w-2 h-2 bg-amber-500 align-middle ml-1" title="stale: no activity for 35+ days"></span>
									{/if}
								</td>
								<td class="text-xs py-2 text-gray-600">{account.type}</td>
								<td class="text-xs py-2 {account.stale ? 'text-amber-700 font-bold' : 'text-gray-600'}">
									{account.lastUpdated ? formatDateShorthand(new Date(account.lastUpdated)) : '—'}
								</td>
								<td class="text-right pr-1 text-sm tabular-nums py-2">
									<span class={account.currentBalance < 0 ? 'text-red-700' : ''}>
										{formatCurrency(account.currentBalance)}
									</span>
								</td>
								<td class="pr-2 py-2 text-right">
									<input
										type="text"
										inputmode="decimal"
										name="balance:{account.id}"
										aria-label="New balance for {account.name}"
										placeholder={(
											Math.round(account.currentBalance) / 100
										).toFixed(2)}
										class="border border-black px-1 py-0.5 text-sm font-mono w-28 text-right bg-white"
									/>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="p-2 border-t border-black flex items-center gap-2">
				<button type="submit" class="bracket-link text-sm" disabled={feedback.isSubmitting}>
					{feedback.isSubmitting ? 'Updating…' : '[Update Balances]'}
				</button>
				<span class="text-xs text-gray-500">blank rows are skipped</span>
			</div>
		</form>
	</div>
</div>
