<script lang="ts">
	import { enhance } from "$app/forms";
	import { type ParsedRow, type ParseError } from "$lib/utils/csv-parser";
	import type { ExistingTransaction } from "$lib/server/imports";
	import StepUpload from "./step-upload.svelte";
	import StepPreview from "./step-preview.svelte";
	import StepReviewOverlap from "./step-review-overlap.svelte";
	import StepConfirm from "./step-confirm.svelte";

	interface Props {
		form?: any;
		accounts: Array<{ id: number; slug: string; name: string; type: string }>;
		categories: Array<{ key: string; name: string }>;
	}

	let { form, accounts, categories }: Props = $props();

	let currentStep = $state(1);
	let selectedAccountId = $state<number | null>(null);
	let parsedData = $state<{ valid: ParsedRow[]; errors: ParseError[] } | null>(null);
	let overlapData = $state<{ existing: ExistingTransaction[] } | null>(null);
	let filteredRows = $state<ParsedRow[]>([]);
	let overlapMode = $state<"skip" | "keep" | null>(null);
	let importResult = $state<{ imported: number; accountSlug: string } | null>(null);
	let fetchOverlapsForm: HTMLFormElement | undefined = $state();

	let dateRange = $derived.by(() => {
		if (!parsedData || parsedData.valid.length === 0) return { from: "", to: "" };
		const dates = parsedData.valid.map((r) => r.date).sort();
		return { from: dates[0], to: dates[dates.length - 1] };
	});

	$effect(() => {
		if (form?.action === "fetch-overlaps" && form.success) {
			overlapData = { existing: form.overlaps };
			currentStep = 3;
		}
		if (form?.action === "import" && form.success) {
			importResult = { imported: form.imported, accountSlug: form.accountSlug };
			currentStep = 5;
		}
	});

	function handleUpload(data: { valid: ParsedRow[]; errors: ParseError[] }, accountId: number) {
		parsedData = data;
		selectedAccountId = accountId;
		currentStep = 2;
	}

	function handleProceedToReview() {
		fetchOverlapsForm?.requestSubmit();
	}

	function handleReviewComplete(data: { filtered: ParsedRow[]; mode: "skip" | "keep" }) {
		filteredRows = data.filtered;
		overlapMode = data.mode;
		currentStep = 4;
	}

	function handleReset() {
		currentStep = 1;
		selectedAccountId = null;
		parsedData = null;
		overlapData = null;
		filteredRows = [];
		overlapMode = null;
		importResult = null;
	}
</script>

<div class="import-wizard">
	<!-- Hidden form for fetching overlaps -->
	<form
		bind:this={fetchOverlapsForm}
		method="POST"
		action="?/fetch-overlaps"
		class="hidden"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
			};
		}}
	>
		<input type="hidden" name="accountId" value={selectedAccountId ?? ""} />
		<input type="hidden" name="fromDate" value={dateRange.from} />
		<input type="hidden" name="toDate" value={dateRange.to} />
	</form>

	{#if currentStep === 1}
		<StepUpload {accounts} onUpload={handleUpload} />
	{:else if currentStep === 2}
		<StepPreview data={parsedData} onBack={() => (currentStep = 1)} onNext={handleProceedToReview} />
	{:else if currentStep === 3 && overlapData}
		<StepReviewOverlap
			accountId={selectedAccountId!}
			parsedData={parsedData!}
			{overlapData}
			{categories}
			onBack={() => (currentStep = 2)}
			onComplete={handleReviewComplete}
		/>
	{:else if currentStep === 3}
		<div class="p-4">
			<p class="text-sm">Checking for overlapping transactions...</p>
		</div>
	{:else if currentStep === 4}
		<StepConfirm
			{filteredRows}
			{accounts}
			accountId={selectedAccountId!}
			onBack={() => (currentStep = 3)}
			onReset={handleReset}
		/>
	{:else if currentStep === 5 && importResult}
		<div class="p-4">
			<h2 class="font-bold text-lg mb-2">Import Complete</h2>
			<p class="mb-4">Successfully imported {importResult.imported} transactions.</p>
			<div class="flex gap-2">
				<a href="/accounts/{importResult.accountSlug}" class="bracket-link">View Account</a>
				<button onclick={handleReset} class="bracket-link">Import More</button>
			</div>
		</div>
	{/if}
</div>
