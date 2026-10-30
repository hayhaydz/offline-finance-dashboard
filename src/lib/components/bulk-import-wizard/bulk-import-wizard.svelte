<script lang="ts">
	import { enhance } from "$app/forms";

	/**
	 * Bulk bank-history import (R26) — e.g. years of Monzo transactions.
	 *
	 * Flow: upload bank CSV → server analyzes columns (Monzo layout
	 * auto-detected) → confirm/adjust the mapping → server transforms to
	 * the app's CSV → the standard reimport preview/commit applies it
	 * (with backup + queue for large files). No parallel importer: the
	 * round-trip engine is the only writer.
	 */

	type AccountContext = {
		id: number;
		slug: string;
		name: string;
		type: string;
		txCount: number;
		firstDate: string | null;
		lastDate: string | null;
	};

	interface Props {
		accounts: AccountContext[];
		form?: any;
	}

	let { accounts, form }: Props = $props();

	let step = $state<"upload" | "map" | "preview" | "result">("upload");
	let csvText = $state("");
	let fileName = $state("");
	let isSubmitting = $state(false);

	let header = $state<string[]>([]);
	let rowCount = $state(0);
	let sample = $state<string[][]>([]);
	let monzoPreset = $state(false);
	let dateCol = $state(0);
	let descriptionCol = $state(0);
	let amountCol = $state(0);
	let categoryCol = $state(-1);
	let dateFormat = $state<"uk" | "iso">("iso");
	let accountSlug = $state("");

	let transformedCsv = $state("");
	let transformedRows = $state(0);
	let skipped = $state<{ reason: string; count: number }[]>([]);
	let previewCounts = $state<{
		inserted: number;
		edited: number;
		deleted: number;
		skipped: number;
	} | null>(null);

	$effect(() => {
		if (form?.action === "bulk-analyze") {
			isSubmitting = false;
			if (form.success) {
				header = form.header;
				rowCount = form.rowCount;
				sample = form.sample;
				monzoPreset = form.monzoPreset;
				dateCol = form.mapping.dateCol;
				descriptionCol = form.mapping.descriptionCol;
				amountCol = form.mapping.amountCol;
				categoryCol = form.mapping.categoryCol;
				dateFormat = form.mapping.dateFormat;
				if (accounts.length > 0 && accountSlug === "") accountSlug = accounts[0].slug;
				step = "map";
			}
		}
		if (form?.action === "bulk-transform") {
			isSubmitting = false;
			if (form.success) {
				transformedCsv = form.transformedCsv;
				transformedRows = form.rows;
				skipped = form.skipped;
				step = "preview";
			}
		}
		if (form?.action === "bulk-preview") {
			isSubmitting = false;
			if (form.success) {
				previewCounts = form.preview.counts;
			}
		}
		if (form?.action === "bulk-queued") {
			isSubmitting = false;
			step = "result";
		}
		if (form?.action === "bulk-commit") {
			isSubmitting = false;
			if (form.success) {
				previewCounts = form.counts;
				step = "result";
			}
		}
	});

	async function handleFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		csvText = await file.text();
		fileName = file.name;
	}

	function reset() {
		step = "upload";
		csvText = "";
		fileName = "";
		transformedCsv = "";
		previewCounts = null;
		skipped = [];
	}

	function enhanceHandler() {
		isSubmitting = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			isSubmitting = false;
		};
	}

	const mappingJson = $derived(
		JSON.stringify({ dateCol, descriptionCol, amountCol, categoryCol, dateFormat }),
	);

	const error: string | null = $derived(
		form?.error &&
			(form.action === "bulk-analyze" || form.action === "bulk-transform")
			? (form.error as string)
			: null,
	);

	const reimportErrors: string[] = $derived(
		step === "preview" &&
			Array.isArray(form?.errors) &&
			form.action === "bulk-preview"
			? form.errors
			: [],
	);
</script>

<div class="p-2 text-xs">
	<p class="text-gray-600 mb-2">
		Import years of bank history (e.g. a Monzo export). Columns are detected
		automatically — Monzo layouts map straight through; others let you pick
		which column is the date, description and amount. Rows land as new
		transactions through the standard reimport engine, with its preview,
		backup and background queue.
	</p>

	{#if error}
		<div class="border border-black bg-red-50 p-1 mb-2 text-red-900">
			<span class="font-bold">ERROR:</span> {error}
		</div>
	{/if}

	{#if step === "upload"}
		<form method="POST" action="?/bulk-analyze" use:enhance={enhanceHandler}>
			<input type="hidden" name="csvText" value={csvText} />
			<div class="border border-black bg-gray-50 p-2 mb-2">
				<input type="file" accept=".csv" onchange={handleFile} class="text-xs" aria-label="Upload bank CSV file" />
				{#if fileName}
					<p class="mt-1">
						Selected: <span class="font-mono">{fileName}</span>
						({(csvText.length / 1024).toFixed(1)} KB)
					</p>
				{/if}
			</div>
			<button
				type="submit"
				disabled={isSubmitting || csvText === ""}
				class="bracket-link {isSubmitting || csvText === '' ? 'opacity-50 pointer-events-none' : ''}"
			>
				{isSubmitting ? "Analyzing..." : "[Analyze File]"}
			</button>
		</form>
	{:else if step === "map"}
		<div class="border border-black bg-gray-50 p-2 mb-2">
			<p class="mb-1">
				<span class="font-bold">{rowCount}</span> rows
				{#if monzoPreset}
					<span class="bg-black text-white px-1 ml-1">MONZO LAYOUT DETECTED</span>
				{/if}
			</p>
			<div class="overflow-x-auto mb-2">
				<table class="w-full">
					<thead>
						<tr class="bg-gray-100 border-b border-black">
							{#each header as h, i (i)}
								<th class="text-left px-1 py-0.5 border-r border-gray-200 last:border-r-0">{h}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each sample as row}
							<tr class="border-b border-gray-200 last:border-b-0">
								{#each row as cell, i (i)}
									<td class="px-1 py-0.5 text-gray-600 whitespace-nowrap">{cell || "—"}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<form method="POST" action="?/bulk-transform" use:enhance={enhanceHandler}>
			<input type="hidden" name="csvText" value={csvText} />
			<input type="hidden" name="mapping" value={mappingJson} />
			<div class="flex flex-wrap gap-2 mb-2">
				<label class="whitespace-nowrap">into account
					<select bind:value={accountSlug} name="accountSlug" class="border border-black px-1">
						{#each accounts as a (a.slug)}
							<option value={a.slug}>{a.name} ({a.txCount} rows)</option>
						{/each}
					</select>
				</label>
				<label class="whitespace-nowrap">date col
					<select bind:value={dateCol} class="border border-black px-1">
						{#each header as h, i (i)}
							<option value={i}>{i}: {h}</option>
						{/each}
					</select>
				</label>
				<label class="whitespace-nowrap">description col
					<select bind:value={descriptionCol} class="border border-black px-1">
						{#each header as h, i (i)}
							<option value={i}>{i}: {h}</option>
						{/each}
					</select>
				</label>
				<label class="whitespace-nowrap">amount col
					<select bind:value={amountCol} class="border border-black px-1">
						{#each header as h, i (i)}
							<option value={i}>{i}: {h}</option>
						{/each}
					</select>
				</label>
				<label class="whitespace-nowrap">category col
					<select bind:value={categoryCol} class="border border-black px-1">
						<option value={-1}>none</option>
						{#each header as h, i (i)}
							<option value={i}>{i}: {h}</option>
						{/each}
					</select>
				</label>
				<label class="whitespace-nowrap">date format
					<select bind:value={dateFormat} class="border border-black px-1">
						<option value="uk">dd/mm/yyyy</option>
						<option value="iso">yyyy-mm-dd</option>
					</select>
				</label>
			</div>
			<div class="flex gap-2">
				<button type="button" class="bracket-link" onclick={reset}>Start Over</button>
				<button
					type="submit"
					disabled={isSubmitting || accountSlug === ""}
					class="bracket-link {isSubmitting || accountSlug === '' ? 'opacity-50 pointer-events-none' : ''}"
				>
					{isSubmitting ? "Transforming..." : "[Transform & Preview]"}
				</button>
			</div>
		</form>
	{:else if step === "preview"}
		<div class="border border-black bg-gray-50 p-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
			<span><span class="font-bold text-green-700">{transformedRows}</span> rows transformed</span>
			{#each skipped as s}
				<span class="text-amber-700">{s.count} skipped ({s.reason})</span>
			{/each}
		</div>

		{#if reimportErrors.length > 0}
			<div class="border border-black bg-red-50 p-2 mb-2">
				<p class="font-bold text-red-700 mb-1">The file was refused — nothing has changed:</p>
				<ul class="list-disc ml-4 text-red-700">
					{#each reimportErrors.slice(0, 10) as err}
						<li>{err}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if previewCounts}
			<div class="border border-black bg-gray-50 p-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
				<span><span class="font-bold text-green-700">{previewCounts.inserted}</span> inserted</span>
				<span><span class="font-bold text-red-700">{previewCounts.deleted}</span> deleted</span>
				<span class="text-gray-600"><span class="font-bold">{previewCounts.skipped}</span> skipped (already present)</span>
			</div>

			<form
				method="POST"
				action="?/bulk-commit"
				use:enhance={enhanceHandler}
				onsubmit={(e) => {
					if (
						previewCounts &&
						!confirm(`Import ${previewCounts.inserted} new transaction(s) into this account? A backup is written first.`)
					) {
						e.preventDefault();
					}
				}}
			>
				<input type="hidden" name="csvText" value={transformedCsv} />
				<input type="hidden" name="recovery" value="0" />
				<div class="flex gap-2">
					<button type="button" class="bracket-link" onclick={reset}>Start Over</button>
					<button
						type="submit"
						disabled={isSubmitting}
						class="bracket-link {isSubmitting ? 'opacity-50 pointer-events-none' : ''}"
					>
						{isSubmitting ? "Importing..." : "[Confirm Import]"}
					</button>
				</div>
			</form>
		{:else}
			<form method="POST" action="?/bulk-preview" use:enhance={enhanceHandler}>
				<input type="hidden" name="csvText" value={transformedCsv} />
				<input type="hidden" name="recovery" value="0" />
				<div class="flex gap-2">
					<button type="button" class="bracket-link" onclick={reset}>Start Over</button>
					<button
						type="submit"
						disabled={isSubmitting}
						class="bracket-link {isSubmitting ? 'opacity-50 pointer-events-none' : ''}"
					>
						{isSubmitting ? "Checking..." : "[Preview Import]"}
					</button>
				</div>
			</form>
		{/if}
	{:else if step === "result"}
		<div class="border border-black bg-green-50 p-2 mb-2">
			<p class="font-bold text-green-700 mb-1">
				{#if previewCounts}
					Import applied — {previewCounts.inserted} inserted
				{:else}
					Queued as a background job (large file)
				{/if}
			</p>
			{#if previewCounts}
				<p>{previewCounts.skipped} rows were already present and untouched.</p>
			{:else}
				<p>The IMPORT JOBS panel below reports progress and counts.</p>
			{/if}
		</div>
		<button type="button" class="bracket-link" onclick={reset}>Done</button>
	{/if}
</div>
