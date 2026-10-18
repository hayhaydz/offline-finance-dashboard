<script lang="ts">
	import { enhance } from "$app/forms";
	import { formatCurrency } from "$lib/utils/currency";

	interface FieldDiff {
		field: string;
		before: string;
		after: string;
	}

	interface PreviewData {
		counts: { inserted: number; edited: number; deleted: number; skipped: number };
		edits: Array<{ rowNumber: number; id: number; accountSlug: string; diffs: FieldDiff[] }>;
		inserts: Array<{
			rowNumber: number;
			accountSlug: string;
			date: string;
			type: string;
			amount: number;
			description: string;
			category: string;
		}>;
		deletes: Array<{
			rowNumber: number;
			id: number;
			accountSlug: string;
			date: string;
			type: string;
			amount: number;
			description: string;
		}>;
		isBackup: boolean;
		editsTruncated?: number;
		insertsTruncated?: number;
		deletesTruncated?: number;
	}

	interface Props {
		form?: any;
	}

	let { form }: Props = $props();

	let step = $state<"upload" | "preview" | "result">("upload");
	let csvText = $state("");
	let fileName = $state("");
	let recovery = $state(false);
	let backupDetected = $state(false);
	let parseError = $state<string | null>(null);
	let isSubmitting = $state(false);

	let preview: PreviewData | null = $state(null);
	let result = $state<{
		counts: PreviewData["counts"];
		backupFilename: string | null;
	} | null>(null);

	$effect(() => {
		if (form?.action === "reimport-preview") {
			isSubmitting = false;
			if (form.success) {
				preview = form.preview;
				step = "preview";
			}
		}
		if (form?.action === "reimport-commit") {
			isSubmitting = false;
			if (form.success) {
				result = { counts: form.counts, backupFilename: form.backupFilename };
				step = "result";
			}
		}
	});

	async function handleFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		if (!file.name.endsWith(".csv")) {
			parseError = "Only .csv files are accepted.";
			return;
		}
		parseError = null;
		const text = await file.text();
		const firstLine =
			text
				.split(/\r?\n/)
				.map((l) => l.trim())
				.find((l) => l !== "") ?? "";
		backupDetected = firstLine.startsWith("# backup of");
		if (backupDetected) {
			// Backup files restore via recovery mode — suggest it immediately.
			recovery = true;
		}
		csvText = text;
		fileName = file.name;
	}

	function reset() {
		step = "upload";
		csvText = "";
		fileName = "";
		recovery = false;
		backupDetected = false;
		parseError = null;
		preview = null;
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
		Array.isArray(form?.errors) && form.action.startsWith("reimport")
			? form.errors
			: [],
	);

	const showBackupSuggestion = $derived(
		form?.action === "reimport-preview" &&
			!form.success &&
			form?.isBackup === true &&
			!recovery,
	);

	function cents(amountPounds: number): number {
		return Math.round(amountPounds * 100);
	}
</script>

<div class="p-2 text-xs">
	<h2 class="font-bold text-base mb-1">CSV Reimport — Edit / Delete / Restore</h2>
	<p class="text-gray-600 mb-2">
		One spreadsheet for every account. Rows with an <span class="font-mono">id</span> are edited
		(or deleted when <span class="font-mono">_delete=1</span>); rows without an
		<span class="font-mono">id</span> are inserted via their
		<span class="font-mono">account_slug</span>. A backup of every touched row is written
		before anything changes.
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

	{#if showBackupSuggestion}
		<div class="border border-black bg-amber-100 p-2 mb-2 flex items-center justify-between gap-2">
			<span>
				This file carries a <span class="font-mono"># backup of</span> header — it looks like a
				backup. Recovery mode restores it (upsert by id).
			</span>
			<label class="flex items-center gap-1 whitespace-nowrap">
				<input type="checkbox" bind:checked={recovery} />
				Recovery mode
			</label>
		</div>
	{/if}

	{#if step === "upload"}
		<form method="POST" action="?/reimport-preview" use:enhance={enhanceHandler}>
			<input type="hidden" name="csvText" value={csvText} />
			<input type="hidden" name="recovery" value={recovery ? "1" : "0"} />

			<div class="border border-black bg-gray-50 p-2 mb-2">
				<label class="flex items-center gap-2 mb-2">
					<input
						type="file"
						accept=".csv"
						onchange={handleFile}
						class="text-xs"
					/>
				</label>
				{#if fileName}
					<p class="mb-1">
						Selected: <span class="font-mono">{fileName}</span>
						({(csvText.length / 1024).toFixed(1)} KB)
					</p>
				{/if}
				{#if backupDetected}
					<p class="text-amber-700 mb-1">
						Backup file detected — recovery mode enabled automatically.
					</p>
				{/if}
				<label class="flex items-center gap-1">
					<input type="checkbox" bind:checked={recovery} />
					Recovery mode (restore from a backup: upsert by id, reinsert deleted rows)
				</label>
			</div>

			{#if parseError}
				<p class="text-red-700 mb-2">{parseError}</p>
			{/if}

			<button
				type="submit"
				disabled={isSubmitting || csvText === ""}
				class="bracket-link {isSubmitting || csvText === '' ? 'opacity-50 pointer-events-none' : ''}"
			>
				{isSubmitting ? "Checking file..." : "[Preview Changes]"}
			</button>
		</form>
	{:else if step === "preview" && preview}
		<!-- Counts bar -->
		<div class="border border-black bg-gray-50 p-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
			<span><span class="font-bold text-green-700">{preview.counts.inserted}</span> inserted</span>
			<span><span class="font-bold">{preview.counts.edited}</span> edited</span>
			<span><span class="font-bold text-red-700">{preview.counts.deleted}</span> deleted</span>
			<span class="text-gray-600"><span class="font-bold">{preview.counts.skipped}</span> skipped (unchanged)</span>
			{#if recovery}
				<span class="bg-black text-white px-1">RECOVERY MODE</span>
			{/if}
		</div>

		<!-- Edits -->
		{#if preview.edits.length > 0}
			<h3 class="font-bold mb-1">Edits ({preview.counts.edited})</h3>
			<div class="border border-black max-h-64 overflow-auto mb-2">
				<table class="w-full">
					<thead class="bg-gray-100">
						<tr class="border-b border-black">
							<th class="p-1 text-left">Row</th>
							<th class="p-1 text-left">Id</th>
							<th class="p-1 text-left">Account</th>
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
									<td class="p-1">{i === 0 ? edit.id : ""}</td>
									<td class="p-1">{i === 0 ? edit.accountSlug : ""}</td>
									<td class="p-1 font-mono">{diff.field}</td>
									<td class="p-1 text-red-700">{diff.before || "—"}</td>
									<td class="p-1 text-green-700">{diff.after || "—"}</td>
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
			{#if preview.editsTruncated}
				<p class="text-gray-600 mb-2">... and {preview.editsTruncated} more edited rows</p>
			{/if}
		{/if}

		<!-- Inserts -->
		{#if preview.inserts.length > 0}
			<h3 class="font-bold mb-1">Inserts ({preview.counts.inserted})</h3>
			<div class="border border-black max-h-64 overflow-auto mb-2">
				<table class="w-full">
					<thead class="bg-gray-100">
						<tr class="border-b border-black">
							<th class="p-1 text-left">Row</th>
							<th class="p-1 text-left">Account</th>
							<th class="p-1 text-left">Date</th>
							<th class="p-1 text-left">Type</th>
							<th class="p-1 text-right">Amount</th>
							<th class="p-1 text-left">Description</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.inserts as ins (ins.rowNumber)}
							<tr class="border-b border-gray-200">
								<td class="p-1">{ins.rowNumber}</td>
								<td class="p-1 font-mono">{ins.accountSlug}</td>
								<td class="p-1">{ins.date}</td>
								<td class="p-1">{ins.type}</td>
								<td class="p-1 text-right tabular-nums {ins.amount >= 0 ? 'text-green-700' : 'text-red-700'}">
									{ins.amount >= 0 ? '+' : ''}{formatCurrency(cents(ins.amount))}
								</td>
								<td class="p-1">{ins.description || "-"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if preview.insertsTruncated}
				<p class="text-gray-600 mb-2">... and {preview.insertsTruncated} more new rows</p>
			{/if}
		{/if}

		<!-- Deletes -->
		{#if preview.deletes.length > 0}
			<h3 class="font-bold mb-1">Deletes ({preview.counts.deleted})</h3>
			<div class="border border-black max-h-64 overflow-auto mb-2">
				<table class="w-full">
					<thead class="bg-gray-100">
						<tr class="border-b border-black">
							<th class="p-1 text-left">Row</th>
							<th class="p-1 text-left">Id</th>
							<th class="p-1 text-left">Account</th>
							<th class="p-1 text-left">Date</th>
							<th class="p-1 text-left">Type</th>
							<th class="p-1 text-right">Amount</th>
							<th class="p-1 text-left">Description</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.deletes as del (del.rowNumber)}
							<tr class="border-b border-gray-200">
								<td class="p-1">{del.rowNumber}</td>
								<td class="p-1">{del.id}</td>
								<td class="p-1 font-mono">{del.accountSlug}</td>
								<td class="p-1">{del.date}</td>
								<td class="p-1">{del.type}</td>
								<td class="p-1 text-right tabular-nums">{formatCurrency(cents(del.amount))}</td>
								<td class="p-1">{del.description || "-"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if preview.deletesTruncated}
				<p class="text-gray-600 mb-2">... and {preview.deletesTruncated} more deleted rows</p>
			{/if}
		{/if}

		{#if preview.counts.inserted === 0 && preview.counts.edited === 0 && preview.counts.deleted === 0}
			<div class="border border-black bg-gray-50 p-2 mb-2">
				Nothing to change — every row matches the current data.
			</div>
		{/if}

		<form
			method="POST"
			action="?/reimport-commit"
			use:enhance={enhanceHandler}
			onsubmit={(e) => {
				if (!preview) return;
				const total = preview.counts.inserted + preview.counts.edited + preview.counts.deleted;
				if (total > 0 && !confirm(`Apply ${total} change(s) to your transactions? A backup is written first.`)) {
					e.preventDefault();
				}
			}}
		>
			<input type="hidden" name="csvText" value={csvText} />
			<input type="hidden" name="recovery" value={recovery ? "1" : "0"} />
			<div class="flex gap-2">
				<button type="button" class="bracket-link" onclick={reset}>Start Over</button>
				<button
					type="submit"
					disabled={isSubmitting}
					class="bracket-link {isSubmitting ? 'opacity-50 pointer-events-none' : ''}"
				>
					{isSubmitting ? "Applying..." : "[Confirm Reimport]"}
				</button>
			</div>
		</form>
	{:else if step === "result" && result}
		<div class="border border-black bg-green-50 p-2 mb-2">
			<p class="font-bold text-green-700 mb-1">Reimport applied</p>
			<p>
				{result.counts.inserted} inserted · {result.counts.edited} edited ·
				{result.counts.deleted} deleted · {result.counts.skipped} skipped
				{#if recovery}(recovery mode){/if}
			</p>
		</div>
		{#if result.backupFilename}
			<p class="mb-2">
				A backup of every touched row's pre-state was written before the change:
				<a
					href="/api/transactions/backup?file={encodeURIComponent(result.backupFilename)}"
					class="bracket-link"
					download
				>
					[Download Backup]
				</a>
			</p>
			<p class="text-gray-600 mb-2">
				Reimport the backup with recovery mode enabled to undo this change.
			</p>
		{:else}
			<p class="text-gray-600 mb-2">No rows were touched, so no backup was needed.</p>
		{/if}
		<button type="button" class="bracket-link" onclick={reset}>[Done]</button>
	{/if}
</div>
