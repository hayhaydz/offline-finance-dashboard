<script lang="ts">
	import { type ParsedRow, type ParseError, parseCSV } from "$lib/utils/csv-parser";

	interface Account {
		id: number;
		slug: string;
		name: string;
		type: string;
	}

	interface Props {
		accounts: Array<Account>;
		onUpload: (data: { valid: ParsedRow[]; errors: ParseError[] }, accountId: number) => void;
	}

	let { accounts, onUpload }: Props = $props();

	let selectedAccountId = $state<number | null>(null);
	let isDragOver = $state(false);
	let parseError = $state<string | null>(null);
	let isProcessing = $state(false);

	function handleFile(file: File) {
		if (!selectedAccountId) {
			parseError = "Select an account before uploading a file.";
			return;
		}

		if (!file.name.endsWith(".csv")) {
			parseError = "Only .csv files are accepted.";
			return;
		}

		isProcessing = true;
		parseError = null;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const text = e.target?.result as string;
				const result = parseCSV(text);
				onUpload(result, selectedAccountId!);
			} catch (err) {
				parseError = err instanceof Error ? err.message : "Failed to parse CSV file.";
			} finally {
				isProcessing = false;
			}
		};
		reader.onerror = () => {
			parseError = "Failed to read file.";
			isProcessing = false;
		};
		reader.readAsText(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) {
			handleFile(file);
		}
	}

	function handleInputChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			handleFile(file);
		}
		input.value = "";
	}
</script>

<div class="p-4">
	<h2 class="font-bold text-lg mb-4">Step 1 of 4: Select Account & Upload</h2>

	<!-- Account selector -->
	<div class="mb-4">
		<label for="account-select" class="block text-sm font-bold mb-1">Account</label>
		<select
			id="account-select"
			class="w-full border border-black p-1 text-sm bg-white font-terminal"
			bind:value={selectedAccountId}
		>
			<option value={null} disabled selected>-- Select Account --</option>
			{#each accounts as account}
				<option value={account.id}>{account.name} ({account.type})</option>
			{/each}
		</select>
	</div>

	<!-- Template downloads -->
	<div class="mb-4 p-2 border border-black bg-gray-50">
		<p class="text-sm font-bold mb-2">Download template:</p>
		<div class="flex gap-2">
			<a href="/templates/transactions-minimal.csv" download class="bracket-link text-xs">
				Minimal Template
			</a>
			<a href="/templates/transactions-full.csv" download class="bracket-link text-xs">
				Full Template
			</a>
		</div>
	</div>

	<!-- Drop zone -->
	<div
		class="border-2 border-black p-8 text-center cursor-pointer {isDragOver
			? 'bg-gray-200'
			: 'bg-gray-50'}"
		role="button"
		tabindex="0"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onclick={() => document.getElementById("csv-file-input")?.click()}
		onkeydown={(e) => {
			if (e.key === "Enter" || e.key === " ") {
				document.getElementById("csv-file-input")?.click();
			}
		}}
	>
		<input
			id="csv-file-input"
			type="file"
			accept=".csv"
			class="hidden"
			onchange={handleInputChange}
		/>
		{#if isProcessing}
			<p class="text-sm">Processing file...</p>
		{:else}
			<p class="text-sm">
				{isDragOver ? "Drop file here" : "Drag & drop a CSV file here, or click to browse"}
			</p>
		{/if}
	</div>

	<!-- Parse error -->
	{#if parseError}
		<p class="text-red-700 text-sm mt-2">{parseError}</p>
	{/if}
</div>
