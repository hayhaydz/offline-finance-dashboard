<script lang="ts">
	import { enhance } from "$app/forms";
	import { formatCurrency } from "$lib/utils/currency";

	/**
	 * Month-keyed history CSV import (R23) — expenses + income months
	 * through the same preview → commit + before-backup safety chain as
	 * the transaction reimport wizard, but keyed by month (upsert/delete,
	 * no ids).
	 */

	interface HistoryDiff {
		field: string;
		before: string;
		after: string;
	}

	interface PreviewData {
		counts: { inserted: number; edited: number; deleted: number; skipped: number };
		edits: Array<{ rowNumber: number; month: string; diffs: HistoryDiff[] }>;
		inserts: Array<{ rowNumber: number; month: string; amount: number; note: string }>;
		deletes: Array<{ rowNumber: number; month: string; amount: number; note: string }>;
		isBackup: boolean;
	}

	interface Props {
		form?: any;
	}

	let { form }: Props = $props();

	let step = $state<"upload" | "preview" | "result">("upload");
	let kind = $state<"expenses" | "income">("expenses");
	let csvText = $state("");
	let fileName = $state("");
	let isSubmitting = $state(false);
	let preview: PreviewData | null = $state(null);
	let queuedJobSlug = $state<string | null>(null);
	let result = $state<{
		kind: string;
		counts: PreviewData["counts"];
		backupFilename: string | null;
	} | null>(null);

	$effect(() => {
		if (form?.action === "history-preview") {
			isSubmitting = false;
			if (form.success) {
				preview = form.preview;
				step = "preview";
			}
		}
		if (form?.action === "history-commit") {
			isSubmitting = false;
			if (form.success) {
				result = { kind: form.kind, counts: form.counts, backupFilename: form.backupFilename };
				step = "result";
			}
		}
		// R22: oversized commit was queued — the IMPORT JOBS panel tracks it
		if (form?.action === "history-queued" && form.success) {
			isSubmitting = false;
			queuedJobSlug = form.jobSlug;
			step = "result";
		}
	});

	async function handleFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		const text = await file.text();
		// The file's own kind comment selects the target table.
		const kindLine = text
			.split(/\r?\n/)
			.map((l) => l.trim())
			.find((l) => l.startsWith("# kind:"));
		if (kindLine === "# kind: expenses") kind = "expenses";
		if (kindLine === "# kind: income") kind = "income";
		csvText = text;
		fileName = file.name;
	}

	function reset() {
		step = "upload";
		csvText = "";
		fileName = "";
		preview = null;
		queuedJobSlug = null;
		result = null;
	}

	function enhanceHandler() {
		isSubmitting = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			isSubmitting = false;
		};
	}

	const errors: string[] = $derived(
		Array.isArray(form?.errors) && form.action.startsWith("history")
			? form.errors
			: [],
	);

	function cents(pounds: number): number {
		return Math.round(pounds * 100);
	}
</script>

<div class="p-2 text-xs">
	<p class="text-gray-600 mb-2">
		Month rows for declared expenses and income history
		(<span class="font-mono">month,amount,note,_delete</span>). Rows edit the
		month's value; <span class="font-mono">_delete=1</span> removes it (unknown,
		not £0). A plaintext pre-state backup is written before anything changes —
		reimporting it undoes the change.
	</p>

	{#if errors.length > 0}
		<div class="border border-black bg-red-50 p-2 mb-2">
			<p class="font-bold text-red-700 mb-1">The file was refused — nothing has changed:</p>
			<ul class="list-disc ml-4 text-red-700">
				{#each errors as err}
					<li>{err}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if step === "upload"}
		<form method="POST" action="?/history-preview" use:enhance={enhanceHandler}>
			<input type="hidden" name="csvText" value={csvText} />
			<input type="hidden" name="kind" value={kind} />

			<div class="border border-black bg-gray-50 p-2 mb-2">
				<div class="flex flex-nowrap items-center gap-2 mb-2">
					<span>target</span>
					<select bind:value={kind} class="border border-black px-1">
						<option value="expenses">expenses history</option>
						<option value="income">income history</option>
					</select>
					<a
						href="/api/history/export?kind={kind}"
						download
						class="bracket-link">Export {kind} CSV</a
					>
				</div>
				<label class="flex items-center gap-2">
					<input type="file" accept=".csv" onchange={handleFile} class="text-xs" aria-label="Upload history CSV file" />
				</label>
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
				{isSubmitting ? "Checking file..." : "[Preview Changes]"}
			</button>
		</form>
	{:else if step === "preview" && preview}
		<div class="border border-black bg-gray-50 p-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
			<span><span class="font-bold text-green-700">{preview.counts.inserted}</span> inserted</span>
			<span><span class="font-bold">{preview.counts.edited}</span> edited</span>
			<span><span class="font-bold text-red-700">{preview.counts.deleted}</span> deleted</span>
			<span class="text-gray-600"><span class="font-bold">{preview.counts.skipped}</span> skipped (unchanged)</span>
			<span class="bg-black text-white px-1">{kind.toUpperCase()}</span>
		</div>

		{#if preview.edits.length > 0}
			<h3 class="font-bold mb-1">Edits ({preview.counts.edited})</h3>
			<div class="border border-black max-h-64 overflow-auto mb-2">
				<table class="w-full">
					<thead class="bg-gray-100">
						<tr class="border-b border-black">
							<th class="p-1 text-left">Row</th>
							<th class="p-1 text-left">Month</th>
							<th class="p-1 text-left">Field</th>
							<th class="p-1 text-left">Before</th>
							<th class="p-1 text-left">After</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.edits as edit (edit.rowNumber)}
							{#each edit.diffs as diff, i}
								<tr class="border-b border-gray-200">
									<td class="p-1">{i === 0 ? edit.rowNumber : ""}</td>
									<td class="p-1 font-mono">{i === 0 ? edit.month : ""}</td>
									<td class="p-1 font-mono">{diff.field}</td>
									<td class="p-1 text-red-700">{diff.before || "—"}</td>
									<td class="p-1 text-green-700">{diff.after || "—"}</td>
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if preview.inserts.length > 0}
			<h3 class="font-bold mb-1">Inserts ({preview.counts.inserted})</h3>
			<div class="border border-black max-h-64 overflow-auto mb-2">
				<table class="w-full">
					<thead class="bg-gray-100">
						<tr class="border-b border-black">
							<th class="p-1 text-left">Row</th>
							<th class="p-1 text-left">Month</th>
							<th class="p-1 text-right">Amount</th>
							<th class="p-1 text-left">Note</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.inserts as ins (ins.rowNumber)}
							<tr class="border-b border-gray-200">
								<td class="p-1">{ins.rowNumber}</td>
								<td class="p-1 font-mono">{ins.month}</td>
								<td class="p-1 text-right tabular-nums">{formatCurrency(cents(ins.amount))}</td>
								<td class="p-1">{ins.note || "-"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if preview.deletes.length > 0}
			<h3 class="font-bold mb-1">Deletes ({preview.counts.deleted})</h3>
			<div class="border border-black max-h-64 overflow-auto mb-2">
				<table class="w-full">
					<thead class="bg-gray-100">
						<tr class="border-b border-black">
							<th class="p-1 text-left">Row</th>
							<th class="p-1 text-left">Month</th>
							<th class="p-1 text-right">Amount</th>
							<th class="p-1 text-left">Note</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.deletes as del (del.rowNumber)}
							<tr class="border-b border-gray-200">
								<td class="p-1">{del.rowNumber}</td>
								<td class="p-1 font-mono">{del.month}</td>
								<td class="p-1 text-right tabular-nums">{formatCurrency(cents(del.amount))}</td>
								<td class="p-1">{del.note || "-"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if preview.counts.inserted === 0 && preview.counts.edited === 0 && preview.counts.deleted === 0}
			<div class="border border-black bg-gray-50 p-2 mb-2">
				Nothing to change — every row matches the current data.
			</div>
		{/if}

		<form
			method="POST"
			action="?/history-commit"
			use:enhance={enhanceHandler}
			onsubmit={(e) => {
				if (!preview) return;
				const total = preview.counts.inserted + preview.counts.edited + preview.counts.deleted;
				if (total > 0 && !confirm(`Apply ${total} change(s) to your ${kind} history? A backup is written first.`)) {
					e.preventDefault();
				}
			}}
		>
			<input type="hidden" name="csvText" value={csvText} />
			<input type="hidden" name="kind" value={kind} />
			<div class="flex gap-2">
				<button type="button" class="bracket-link" onclick={reset}>Start Over</button>
				<button
					type="submit"
					disabled={isSubmitting}
					class="bracket-link {isSubmitting ? 'opacity-50 pointer-events-none' : ''}"
				>
					{isSubmitting ? "Applying..." : "[Confirm Import]"}
				</button>
			</div>
		</form>
	{:else if step === "result" && queuedJobSlug}
		<div class="border border-black bg-amber-100 p-2 mb-2">
			<p class="font-bold text-amber-800 mb-1">Queued as a background job</p>
			<p>
				This file is large, so it was accepted and queued
				(<span class="font-mono">{queuedJobSlug.slice(0, 8)}…</span>) instead of
				running inline. The IMPORT JOBS panel below reports progress and counts
				when it finishes.
			</p>
		</div>
		<button type="button" class="bracket-link" onclick={reset}>Done</button>
	{:else if step === "result" && result}
		<div class="border border-black bg-green-50 p-2 mb-2">
			<p class="font-bold text-green-700 mb-1">{result.kind} history import applied</p>
			<p>
				{result.counts.inserted} inserted · {result.counts.edited} edited ·
				{result.counts.deleted} deleted · {result.counts.skipped} skipped
			</p>
		</div>
		{#if result.backupFilename}
			<p class="mb-2">
				Pre-state backup written:
				<a
					href="/api/transactions/backup?file={encodeURIComponent(result.backupFilename)}"
					class="bracket-link"
					download
				>
					Download Backup
				</a>
				— reimport it to undo.
			</p>
		{:else}
			<p class="text-gray-600 mb-2">No rows were touched, so no backup was needed.</p>
		{/if}
		<button type="button" class="bracket-link" onclick={reset}>Done</button>
	{/if}
</div>
