<script lang="ts">
	import { enhance } from "$app/forms";
	import type { SubmitFunction } from "@sveltejs/kit";
	import ImportWizard from "$lib/components/import-wizard/import-wizard.svelte";
	import ReimportWizard from "$lib/components/reimport-wizard/reimport-wizard.svelte";
	import { formatCurrency } from "$lib/utils/currency";

	type RefundCandidate = {
		slug: string;
		accountName: string;
		accountSlug: string;
		transactionDate: string;
		amount: number;
		description: string | null;
	};

	let { data, form } = $props<{
		data: {
			user: { id: number; username: string };
			accounts: Array<{ id: number; slug: string; name: string; type: string }>;
			categories: Array<{ key: string; name: string }>;
		};
		form?: any;
	}>();

	let refundCandidates: RefundCandidate[] | null = $state(null);
	let reclassifiedCount: number | null = $state(null);
	let scanning = $state(false);

	$effect(() => {
		if (form?.action === "list-refund-candidates" && form?.success) {
			refundCandidates = form.candidates;
			reclassifiedCount = null;
		}
		if (form?.action === "reclassify-refunds" && form?.success) {
			reclassifiedCount = form.reclassified;
			refundCandidates = [];
		}
	});

	// Refund-scan feedback (audit: previously-silent failures). The scan form
	// uses an applyFailures-style enhance so `scanning` always resets and
	// failures reach the `form` prop for rendering below.
	let scanError = $state<string | null>(null);

	const scanEnhance: SubmitFunction = () => {
		scanning = true;
		scanError = null;
		return async ({ result, update }) => {
			scanning = false;
			if (result.type === "redirect") {
				await update();
				return;
			}
			if (result.type === "error") {
				scanError = "Failed to list refund candidates — try again.";
			}
			// Apply the result to the page so success data / failure errors
			// flow through `form`.
			await update({ reset: false });
		};
	};

	const refundError = $derived(
		scanError ??
			(form?.error &&
			(form.action === "list-refund-candidates" ||
				form.action === "reclassify-refunds")
				? (form.error as string)
				: null),
	);
</script>

<main>
	<section>
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>SETTINGS / DATA MANAGEMENT</span>
		</div>

		<ImportWizard
			accounts={data.accounts}
			categories={data.categories}
			{form}
		/>
	</section>

	<section class="border-t border-black">
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>CSV REIMPORT — EDIT / DELETE / RESTORE</span>
			<a href="/api/transactions/export" class="bracket-link text-xs">Export CSV</a>
		</div>
		<ReimportWizard {form} />
	</section>

	<section class="border-t border-black">
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>REFUND RECLASSIFICATION</span>
		</div>
		<div class="p-2 text-xs">
			<p class="text-gray-600 mb-2">
				Historical card refunds were recorded as <span class="font-mono">value_change</span> before the
				<span class="font-mono">refund</span> type existed. Scan lists credit-card
				<span class="font-mono">value_change</span> rows with negative amounts; nothing changes until you confirm.
			</p>

		{#if refundError}
			<div class="border border-black bg-red-100 p-1 mb-2 text-xs text-red-900">
				<span class="font-bold">ERROR:</span> {refundError}
			</div>
		{/if}

		<form
			method="POST"
			action="?/list-refund-candidates"
			class="mb-2"
			use:enhance={scanEnhance}
		>
			<button type="submit" class="bracket-link" disabled={scanning}>
				{scanning ? 'Scanning...' : '[Scan For Candidates]'}
			</button>
		</form>

			{#if reclassifiedCount !== null}
				<div class="border border-black bg-green-50 p-1 mb-2">
					<span class="text-green-700 font-bold">RECLASSIFIED {reclassifiedCount}</span>
					row{reclassifiedCount !== 1 ? 's' : ''} converted to
					<span class="font-mono">refund</span>. Budget totals will now net these refunds against spending.
				</div>
			{/if}

			{#if refundCandidates !== null}
				{#if refundCandidates.length === 0}
					<p class="text-gray-400">No candidate rows found — nothing recorded as negative
						<span class="font-mono">value_change</span> on credit cards.</p>
				{:else}
					{@const candidates = refundCandidates}
					<div class="border border-black mb-2 overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="bg-gray-100 border-b border-black">
									<th class="text-left px-1 py-0.5">Date</th>
									<th class="text-left px-1 py-0.5">Account</th>
									<th class="text-left px-1 py-0.5">Description</th>
									<th class="text-right px-1 py-0.5">Amount</th>
								</tr>
							</thead>
							<tbody>
								{#each refundCandidates as c (c.slug)}
									<tr class="border-b border-gray-200 last:border-b-0">
										<td class="px-1 py-0.5 whitespace-nowrap">{c.transactionDate}</td>
										<td class="px-1 py-0.5">
											<a href="/accounts/{c.accountSlug}" class="bracket-link">{c.accountName}</a>
										</td>
										<td class="px-1 py-0.5 text-gray-600">{c.description || '-'}</td>
										<td class="px-1 py-0.5 text-right tabular-nums">{formatCurrency(c.amount)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				<p class="text-gray-600 mb-2">
					{candidates.length} row{candidates.length !== 1 ? 's' : ''} will be retyped to
					<span class="font-mono">refund</span> (amounts preserved). Historical budget months may show lower spending after applying.
				</p>
				<form
					method="POST"
					action="?/reclassify-refunds"
					onsubmit={(e) => { if (!confirm(`Reclassify ${candidates.length} row(s) to refund? This cannot be undone automatically.`)) e.preventDefault(); }}
				>
					<button type="submit" class="bracket-link text-red-700">[Reclassify All To Refund]</button>
				</form>
				{/if}
			{/if}
		</div>
	</section>
</main>
