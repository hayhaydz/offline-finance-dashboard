<script lang="ts">
	import { enhance } from "$app/forms";
	import SubmitFeedback from "$lib/components/SubmitFeedback.svelte";
	import { formatCurrency, formatDateShorthand } from "$lib/utils/currency";
	import {
		getTransactionTypeBadgeClass,
		getTransactionTypeLabel,
	} from "$lib/utils/formatting";
	import { useSubmitFeedback } from "$lib/utils/use-submit-feedback.svelte";
	import { truncateDisplay, DISPLAY_LIMITS } from "$lib/utils/fieldLimits";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const feedback = useSubmitFeedback();

	const monthLabel = $derived.by(() => {
		const [y, m] = data.month.split("-");
		const date = new Date(Number(y), Number(m) - 1, 1);
		return date.toLocaleDateString("en-GB", {
			month: "long",
			year: "numeric",
		});
	});
</script>

<div class="max-w-4xl mx-auto p-4 font-mono">
	<div class="border border-black">
		<div class="border-b border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
			<span>UNCATEGORISED — {monthLabel.toUpperCase()}</span>
			<a class="bracket-link text-xs" href="../">[Back to budget]</a>
		</div>

		<div class="p-2 text-xs border-b border-black bg-gray-50">
			{data.transactions.length} transaction{data.transactions.length !== 1 ? "s" : ""}
			· {formatCurrency(data.totalSpent)} spending
			<span class="text-gray-500"> · tag each row to move it into a category</span>
		</div>

		<SubmitFeedback message={feedback.message} onDismiss={feedback.dismiss} />

		{#if data.transactions.length === 0}
			<p class="text-gray-600 text-xs p-2">
				Nothing uncategorised this month — every spending row is tagged.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full table-fixed min-w-[800px]">
					<thead>
						<tr class="bg-gray-100 border-b border-black">
							<th class="pl-2 text-left w-24">Date</th>
							<th class="text-left w-32">Account</th>
							<th class="text-left w-24">Type</th>
							<th class="text-left w-sm">Description</th>
							<th class="text-right pr-1 w-28">Amount</th>
							<th class="pl-2 text-left w-64">Category</th>
						</tr>
					</thead>
					<tbody>
						{#each data.transactions as tx (tx.slug)}
							<tr class="border-b border-gray-200 align-top">
								<td class="pl-2 text-sm py-2 whitespace-nowrap">{formatDateShorthand(new Date(tx.transactionDate))}</td>
								<td class="text-sm py-2">
									<a class="bracket-link text-xs" href="/accounts/{tx.accountSlug}">{tx.accountName}</a>
								</td>
								<td class="text-sm py-2 whitespace-nowrap">
									<span class="px-1 text-xs {getTransactionTypeBadgeClass(tx.type)}">
										{getTransactionTypeLabel(tx.type)}
									</span>
								</td>
								<td class="pl-2 text-sm py-2 text-gray-600 break-words">
									{truncateDisplay(tx.description || "-", DISPLAY_LIMITS.BALANCE_NOTES)}
								</td>
								<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
									<span class="text-red-700">-{formatCurrency(Math.abs(tx.amount))}</span>
								</td>
								<td class="pl-2 py-2">
									<form
										method="POST"
										action="?/tag"
										class="flex items-center gap-1"
										use:enhance={feedback.createEnhanceHandler("Tagged")}
									>
										<input type="hidden" name="transactionSlug" value={tx.slug} />
										<select
											name="categoryId"
											aria-label="Category for {tx.description || tx.slug}"
											required
											class="border border-black px-1 py-0.5 text-xs bg-white max-w-[180px]"
										>
											<option value="" disabled selected>choose…</option>
											{#each data.categories as cat (cat.id)}
												<option value={cat.id}>{cat.name}</option>
											{/each}
										</select>
										<button type="submit" class="bracket-link text-xs">[Tag]</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
