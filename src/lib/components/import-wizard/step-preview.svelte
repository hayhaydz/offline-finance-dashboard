<script lang="ts">
	import { type ParsedRow, type ParseError } from "$lib/utils/csv-parser";

	interface Props {
		data: { valid: ParsedRow[]; errors: ParseError[] } | null;
		onBack: () => void;
		onNext: () => void;
	}

	let { data, onBack, onNext }: Props = $props();

	let maxPreviewRows = 100;

	let totalRows = $derived(data ? data.valid.length + data.errors.length : 0);
	let canProceed = $derived(data ? data.valid.length > 0 : false);
	let overflowCount = $derived(
		data && data.valid.length > maxPreviewRows ? data.valid.length - maxPreviewRows : 0
	);
	let displayRows = $derived(
		data && data.valid.length > maxPreviewRows
			? data.valid.slice(0, maxPreviewRows)
			: data?.valid ?? []
	);

	function formatAmount(amount: number): string {
		return amount.toFixed(2);
	}

	function truncateDescription(desc: string, maxLen: number = 40): string {
		if (desc.length <= maxLen) return desc;
		return desc.slice(0, maxLen) + "...";
	}
</script>

<div class="p-4">
	<h2 class="font-bold text-lg mb-4">Step 2 of 4: Preview Data</h2>

	{#if data}
		<!-- Summary bar -->
		<div class="border border-black bg-gray-50 p-2 mb-4">
			<span class="text-sm font-bold">
				Total parsed: {totalRows} rows ({data.errors.length} errors)
			</span>
		</div>

		<!-- Error table -->
		{#if data.errors.length > 0}
			<div class="mb-4">
				<h3 class="text-sm font-bold mb-2 text-red-700">Parse Errors</h3>
				<div class="border border-black max-h-48 overflow-auto">
					<table class="w-full text-xs">
						<thead class="bg-gray-100">
							<tr class="border-b border-black">
								<th class="p-1 text-left">Row</th>
								<th class="p-1 text-left">Column</th>
								<th class="p-1 text-left">Error</th>
							</tr>
						</thead>
						<tbody>
							{#each data.errors as error, i}
								<tr class="border-b border-black">
									<td class="p-1">{error.row}</td>
									<td class="p-1">{error.column ?? "-"}</td>
									<td class="p-1 text-red-700">{error.message}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Valid rows table -->
		{#if displayRows.length > 0}
			<div class="mb-4">
				<h3 class="text-sm font-bold mb-2">Valid Rows</h3>
				<div class="border border-black max-h-96 overflow-auto">
					<table class="w-full text-xs">
						<thead class="bg-gray-100">
							<tr class="border-b border-black">
								<th class="p-1 text-left">Date</th>
								<th class="p-1 text-left">Type</th>
								<th class="p-1 text-right">Amount</th>
								<th class="p-1 text-left">Description</th>
							</tr>
						</thead>
						<tbody>
							{#each displayRows as row, i}
								<tr class="border-b border-black">
									<td class="p-1">{row.date}</td>
									<td class="p-1">{row.type ?? "-"}</td>
									<td class="p-1 text-right">{formatAmount(row.amount)}</td>
									<td class="p-1" title={row.description}>
										{truncateDescription(row.description)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if overflowCount > 0}
					<p class="text-xs text-amber-600 mt-1">... and {overflowCount} more</p>
				{/if}
			</div>
		{/if}

		<!-- Navigation -->
		<div class="flex gap-2">
			<button onclick={onBack} class="bracket-link text-sm">Back</button>
			{#if canProceed}
				<button onclick={onNext} class="bracket-link text-sm">Next</button>
			{/if}
		</div>
	{:else}
		<p class="text-sm">No data to preview.</p>
		<div class="flex gap-2 mt-4">
			<button onclick={onBack} class="bracket-link text-sm">Back</button>
		</div>
	{/if}
</div>
