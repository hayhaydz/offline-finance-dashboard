<script lang="ts">
	import { type ParsedRow, type ParseError } from "$lib/utils/csv-parser";
	import type { ExistingTransaction } from "$lib/server/imports";

	interface Props {
		accountId: number;
		parsedData: { valid: ParsedRow[]; errors: ParseError[] };
		overlapData: { existing: ExistingTransaction[] };
		categories: Array<{ key: string; name: string }>;
		onBack: () => void;
		onComplete: (data: { filtered: ParsedRow[]; mode: "skip" | "keep" }) => void;
	}

	let { parsedData, overlapData, onBack, onComplete }: Props = $props();

	let selectedMode = $state<"skip" | "keep" | "choose" | null>(null);

	let fromDate = $derived(
		parsedData.valid.length > 0
			? parsedData.valid
					.map((r) => r.date)
					.sort()
					.slice(0, 1)[0]
			: null
	);

	let toDate = $derived(
		parsedData.valid.length > 0
			? parsedData.valid
					.map((r) => r.date)
					.sort()
					.slice(-1)[0]
			: null
	);

	// Build a date-keyed map of existing transactions
	let overlapMap = $derived(() => {
		const map = new Map<string, ExistingTransaction[]>();
		for (const txn of overlapData.existing) {
			const key = txn.transactionDate;
			if (!map.has(key)) {
				map.set(key, []);
			}
			map.get(key)!.push(txn);
		}
		return map;
	});

	// Check if a parsed row has overlaps on the same date
	function hasOverlap(row: ParsedRow): boolean {
		const map = overlapMap();
		const existing = map.get(row.date);
		return !!existing && existing.length > 0;
	}

	let overlapRows = $derived(() => {
		return parsedData.valid.filter((row) => hasOverlap(row));
	});

	let nonOverlapRows = $derived(() => {
		return parsedData.valid.filter((row) => !hasOverlap(row));
	});

	let overlapCount = $derived(overlapRows().length);
	let existingCount = $derived(overlapData.existing.length);
	let newCount = $derived(parsedData.valid.length);

	// Per-row toggle state for "choose" mode: row index -> whether to import
	let rowSelections = $state<Map<number, boolean>>(new Map());

	function toggleRowSelection(index: number) {
		const updated = new Map(rowSelections);
		updated.set(index, !updated.get(index));
		rowSelections = updated;
	}

	function getRowImportStatus(row: ParsedRow, index: number): "NEW" | "SKIP" {
		if (!hasOverlap(row)) return "NEW";
		if (selectedMode === "skip") return "SKIP";
		if (selectedMode === "keep") return "NEW";
		if (selectedMode === "choose") {
			return rowSelections.get(index) === false ? "SKIP" : "NEW";
		}
		return "NEW";
	}

	function getFilteredRows(): ParsedRow[] {
		if (selectedMode === "skip") {
			return nonOverlapRows();
		}
		if (selectedMode === "keep") {
			return parsedData.valid;
		}
		if (selectedMode === "choose") {
			return parsedData.valid.filter((row, index) => {
				if (!hasOverlap(row)) return true;
				return rowSelections.get(index) !== false;
			});
		}
		return parsedData.valid;
	}

	function handleContinue() {
		if (selectedMode === null) return;
		onComplete({
			filtered: getFilteredRows(),
			mode: selectedMode === "choose" ? "keep" : selectedMode
		});
	}

	function formatAmount(amount: number): string {
		return amount.toFixed(2);
	}
</script>

<div class="p-4">
	<h2 class="font-bold text-lg mb-4">Step 3 of 4: Review Overlaps</h2>

	<!-- Date range -->
	{#if fromDate && toDate}
		<p class="text-xs mb-2">Checking against existing transactions from {fromDate} to {toDate}</p>
	{/if}

	<!-- Summary -->
	<div class="border border-black bg-gray-50 p-2 mb-4">
		<span class="text-sm font-bold">
			Found: {existingCount} existing transactions | Importing: {newCount} new transactions |
			{overlapCount} potential overlaps
		</span>
	</div>

	<!-- Overlap mode selection -->
	{#if overlapCount > 0}
		{#if selectedMode === null}
			<div class="mb-4">
				<p class="text-sm mb-2">How would you like to handle overlapping transactions?</p>
				<div class="flex gap-2">
					<button
						onclick={() => (selectedMode = "skip")}
						class="bracket-link text-sm"
					>
						Skip All
					</button>
					<button
						onclick={() => (selectedMode = "keep")}
						class="bracket-link text-sm"
					>
						Keep All
					</button>
					<button
						onclick={() => {
							selectedMode = "choose";
							const defaults = new Map<number, boolean>();
							parsedData.valid.forEach((row, i) => {
								if (hasOverlap(row)) defaults.set(i, true);
							});
							rowSelections = defaults;
						}}
						class="bracket-link text-sm"
					>
						Choose Per Row
					</button>
				</div>
			</div>
		{/if}

		<!-- Overlap table -->
		{#if selectedMode !== null}
			<div class="mb-4">
				<h3 class="text-sm font-bold mb-2">
					{selectedMode === "skip"
						? "Transactions to Skip"
						: selectedMode === "keep"
							? "Overlapping Transactions (will be imported)"
							: "Select which overlapping rows to import"}
				</h3>
				<div class="border border-black max-h-64 overflow-auto">
					<table class="w-full text-xs">
						<thead class="bg-gray-100">
							<tr class="border-b border-black">
								<th class="p-1 text-left">Date</th>
								<th class="p-1 text-left">Type</th>
								<th class="p-1 text-right">Amount</th>
								<th class="p-1 text-left">Description</th>
								<th class="p-1 text-left">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each overlapRows() as row, i}
								{@const status = getRowImportStatus(row, parsedData.valid.indexOf(row))}
								<tr
									class="border-b border-black {selectedMode === 'choose'
										? 'cursor-pointer'
										: ''} {status === 'SKIP' ? 'text-gray-400' : ''}"
									onclick={() => {
										if (selectedMode === "choose") {
											toggleRowSelection(parsedData.valid.indexOf(row));
										}
									}}
								>
									<td class="p-1">{row.date}</td>
									<td class="p-1">{row.type ?? "-"}</td>
									<td class="p-1 text-right">{formatAmount(row.amount)}</td>
									<td class="p-1">{row.description}</td>
									<td class="p-1">
										{#if selectedMode === "choose"}
											<button class="bracket-link text-xs" onclick={(e) => e.stopPropagation()}>
												{status}
											</button>
										{:else}
											<span class="{status === 'SKIP' ? 'text-red-700' : ''}">{status}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Continue button -->
			<div class="flex gap-2">
				<button onclick={onBack} class="bracket-link text-sm">Back</button>
				<button onclick={handleContinue} class="bracket-link text-sm">
					{#if selectedMode === "skip"}
						Skip All & Continue
					{:else if selectedMode === "keep"}
						Keep All & Continue
					{:else}
						Import Selected
					{/if}
				</button>
			</div>
		{/if}
	{:else}
		<!-- No overlaps -->
		<div class="mb-4">
			<p class="text-sm">No overlapping transactions found. All rows will be imported.</p>
		</div>
		<div class="flex gap-2">
			<button onclick={onBack} class="bracket-link text-sm">Back</button>
			<button
				onclick={() => onComplete({ filtered: parsedData.valid, mode: "keep" })}
				class="bracket-link text-sm"
			>
				Continue
			</button>
		</div>
	{/if}
</div>
