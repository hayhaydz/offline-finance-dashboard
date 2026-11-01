<script lang="ts">
	import { enhance } from "$app/forms";
	import { formatCurrency } from "$lib/utils/currency";
	import SubmitFeedback from "$lib/components/SubmitFeedback.svelte";
	import { useSubmitFeedback } from "$lib/utils/use-submit-feedback.svelte";
	import {
		BUDGET_SPENDING_TYPES,
		TRANSACTION_TYPE_LABELS,
	} from "$lib/utils/domain-constants";
	import type { PageData, ActionData } from "./$types";
	import type { AmendmentTimelineEntry } from "$lib/types/budget";

	/**
	 * v3.2 V4 (2026-11-01): the dedicated config page for a trend month.
	 * User direction — "budget filtering/amendments should be at the top,
	 * inside a single button separate page. also the amendment options
	 * should be on that other page" — the month page links here via
	 * [Config & amendments]; everything editable lives on THIS page:
	 * amendment options (note + applies), the monthly target + its account
	 * scope, per-category targets, filters (categories/accounts/types) and
	 * the amendment log. No accordions — the page IS the detail (D6).
	 * No default HTML radio/select styling: choices are bracket toggles
	 * with hidden form inputs carrying the submitted values.
	 */
	let { data }: { data: PageData; form: ActionData } = $props();

	const targetFeedback = useSubmitFeedback();
	const filterFeedback = useSubmitFeedback();

	// ── Amendment options shared by every form below ──
	let amendNote = $state("");
	let applyForward = $state(false);

	// Budget creation scoping: explicit choice, no silent default
	let scopeAllAccounts = $state(false);
	let scopeSelectedIds = $state<number[]>([]);

	// Inline editing state for category targets
	let editingCategoryId = $state<number | null>(null);
	let editAmount = $state("");

	let targetedCategories = $derived(
		data.categoryBreakdown.filter((c) => c.target !== null),
	);
	let untargetedCategories = $derived(
		data.categoryBreakdown.filter((c) => c.target === null && !data.budget?.excludedCategoryIds.includes(c.id)),
	);
	let excludedCategories = $derived(
		data.categoryBreakdown.filter((c) => data.budget?.excludedCategoryIds.includes(c.id)),
	);
	let untargetedWithSpend = $derived(untargetedCategories.filter((c) => c.spent > 0));
	let untargetedZero = $derived(untargetedCategories.filter((c) => c.spent <= 0));

	function getMonthLabel(monthStr: string): string {
		const [y, m] = monthStr.split("-");
		const date = new Date(Number(y), Number(m) - 1);
		return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
	}

	// ── Amendment helpers (log + markers) ──
	function latestAmendment(field: string): AmendmentTimelineEntry | null {
		return data.amendments.find((a) => a.field === field) ?? null;
	}

	function formatAmendmentValue(field: string, value: unknown): string {
		if (value === null || value === undefined) return "—";
		if (field === "totalTargetInCents" || field.startsWith("categoryTarget:")) {
			return formatCurrency(Number(value));
		}
		if (Array.isArray(value)) {
			if (field === "excludedTypes") {
				return value.length === 0
					? "(none)"
					: value.map((t) => TRANSACTION_TYPE_LABELS[t as keyof typeof TRANSACTION_TYPE_LABELS] ?? t).join(", ");
			}
			return value.length === 0 ? "(none)" : `${value.length} excluded`;
		}
		return String(value);
	}

	function amendmentFieldLabel(field: string): string {
		if (field.startsWith("categoryTarget:")) {
			const categoryId = Number(field.split(":")[1]);
			const cat = data.categories.find((c) => c.id === categoryId);
			return `${cat?.name ?? "Category"} target`;
		}
		switch (field) {
			case "totalTargetInCents": return "Total target";
			case "excludedCategoryIds": return "Excluded categories";
			case "excludedAccountIds": return "Excluded accounts";
			case "excludedTypes": return "Excluded types";
			default: return field;
		}
	}

	function formatAmendmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString("en-GB", {
			day: "2-digit", month: "short", year: "numeric",
		});
	}

	function amendmentMarker(field: string): string | null {
		const amendment = latestAmendment(field);
		if (!amendment) return null;
		return `[amended ${formatAmendmentDate(amendment.createdAt)} — was ${formatAmendmentValue(field, amendment.oldValue)}]`;
	}

	function getCatProgress(spent: number, target: number): {
		width: number; color: string; overBy: number | null;
	} {
		const rawPct = target > 0 ? Math.round((spent / target) * 100) : 0;
		const color = rawPct > 100 ? "bg-red-700" : rawPct > 75 ? "bg-amber-600" : "bg-green-700";
		return { width: Math.min(rawPct, 100), color, overBy: rawPct > 100 ? spent - target : null };
	}

	function startEdit(categoryId: number, currentTarget: number | null) {
		editingCategoryId = categoryId;
		editAmount = currentTarget ? (currentTarget / 100).toFixed(2) : "";
	}

	function cancelEdit() {
		editingCategoryId = null;
		editAmount = "";
	}

	// ── Client-side validation, matching server rules ──
	const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

	function validatedAmountSubmit(
		feedback: ReturnType<typeof useSubmitFeedback>,
		successText: string,
	) {
		return (input: { formData: FormData; cancel: () => void }) => {
			const amount = String(input.formData.get("amount") ?? "").trim();
			if (!AMOUNT_PATTERN.test(amount)) {
				feedback.message = { type: "error", text: "Enter a valid amount like 123.45" };
				input.cancel();
				return;
			}
			return feedback.createEnhanceHandler(successText, {
				onSuccess: () => cancelEdit(),
			})();
		};
	}

	function validatedCreateSubmit(input: { formData: FormData; cancel: () => void }) {
		const amount = String(input.formData.get("amount") ?? "").trim();
		if (!AMOUNT_PATTERN.test(amount)) {
			targetFeedback.message = { type: "error", text: "Enter a valid amount like 123.45" };
			input.cancel();
			return;
		}
		if (!scopeAllAccounts && scopeSelectedIds.length === 0) {
			targetFeedback.message = {
				type: "error",
				text: "Choose accounts for this target or tick All accounts",
			};
			input.cancel();
			return;
		}
		return targetFeedback.createEnhanceHandler("Target saved")();
	}

	function toggleScopeAccount(id: number) {
		scopeSelectedIds = scopeSelectedIds.includes(id)
			? scopeSelectedIds.filter((x) => x !== id)
			: [...scopeSelectedIds, id];
	}
</script>

<div class="p-2 flex flex-col gap-2">
	<!-- page header: the reports/tools pattern -->
	<div class="flex justify-between items-baseline flex-wrap gap-2">
		<h1 class="text-lg font-bold m-0">Trend config</h1>
		<div class="flex items-center gap-2 text-xs">
			<a href="/overview/trends/{data.selectedMonth}" class="bracket-link">← Monthly Trend</a>
			<span class="font-bold">{getMonthLabel(data.selectedMonth)}</span>
		</div>
	</div>
	<p class="text-xs text-gray-600 m-0">
		{#if data.isCurrentMonth}
			statement-based month — config editable now, figures firm up at statement time
		{:else}
			historical month — config editable, transactions immutable
		{/if}
		· every edit below can carry a note + whether it applies forward
	</p>

	<!-- AMENDMENT OPTIONS: the page's control strip (V4 — lives here, permanent) -->
	<div class="border border-black">
		<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
			<span>AMENDMENT OPTIONS</span>
			<span class="text-[10px] font-normal text-gray-600">attach to your next edit below</span>
		</div>
		<div class="px-2 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 bg-gray-50 border-b border-black">
			<label class="flex items-center gap-1 text-xs text-gray-800">
				<span>Note</span>
				<input
					type="text"
					name="amendNote"
					bind:value={amendNote}
					maxlength="200"
					placeholder="optional — why is this changing?"
					class="border border-black bg-white px-1 py-0.5 w-64 font-terminal text-xs text-gray-900 placeholder:text-gray-600"
				/>
			</label>
			<div class="flex items-center gap-2 text-xs">
				<span class="text-gray-800">Applies</span>
				<button
					type="button"
					class="bracket-link text-xs font-bold cursor-pointer"
					class:text-green-800={!applyForward}
					aria-pressed={!applyForward}
					onclick={() => (applyForward = false)}
				>
					this month only
				</button>
				<button
					type="button"
					class="bracket-link text-xs font-bold cursor-pointer"
					class:text-green-800={applyForward}
					aria-pressed={applyForward}
					onclick={() => (applyForward = true)}
				>
					this + future months
				</button>
			</div>
		</div>
		<div class="px-2 py-1 text-[10px] text-gray-600">
			Transactions are immutable — only config changes are recorded. The note and scope ride along with whichever edit you make next.
		</div>
	</div>

	<!-- TARGET / MO -->
	<div class="border border-black">
		<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
			<span>TARGET / MO</span>
			{#if data.budget}
				<span class="text-xs font-normal">
					<span class="font-bold">{formatCurrency(data.budget.totalTargetInCents)}</span>
					<span class="text-gray-600">· sum of category targets · {formatCurrency(data.totalSpent)} spent</span>
				</span>
			{/if}
		</div>
		<div class="px-2 py-2 border-b border-black">
			{#if data.budget}
				<div class="text-sm text-gray-600">
					Total (sum of category targets): <span class="font-bold text-black">{formatCurrency(data.budget.totalTargetInCents)}</span>
					{#if amendmentMarker('totalTargetInCents')}
						<span class="text-[10px] text-amber-700 ml-1">{amendmentMarker('totalTargetInCents')}</span>
					{/if}
				</div>
				<div class="text-xs text-gray-600 mt-1">Set individual category targets below to adjust the total.</div>
			{:else if data.isCurrentMonth}
				<form method="POST" action="?/saveTarget" use:enhance={validatedCreateSubmit}>
					<div class="flex items-center gap-2 text-sm">
						<span class="text-xs">Target</span>
						<span>£</span>
						<input name="amount" type="text" class="border border-black p-1 w-28 font-terminal text-sm bg-white" placeholder="0.00" />
						<button type="submit" class="bracket-link text-xs" disabled={targetFeedback.isSubmitting}>
							{targetFeedback.isSubmitting ? 'Saving...' : 'Save'}
						</button>
					</div>
					<input type="hidden" name="note" value={amendNote} />
					<!-- Scope: bracket toggles + hidden inputs (no native checkbox/radio) -->
					<input type="hidden" name="allAccounts" value={scopeAllAccounts ? 'on' : 'off'} />
					{#each scopeSelectedIds as id (id)}
						<input type="hidden" name="accountIds" value={id} />
					{/each}
					<div class="mt-2 border border-dotted border-gray-400 p-1.5">
						<div class="text-gray-600 font-bold text-xs py-0.5">SCOPE — WHICH ACCOUNTS DOES THIS BUDGET COVER?</div>
						<button
							type="button"
							role="checkbox"
							class="flex items-center gap-1.5 py-0.5 cursor-pointer text-xs"
							aria-checked={scopeAllAccounts}
							onclick={() => (scopeAllAccounts = !scopeAllAccounts)}
						>
							<span class="font-bold">{scopeAllAccounts ? '[X]' : '[ ]'}</span>
							<span class="{scopeAllAccounts ? 'font-bold' : ''}">All accounts</span>
						</button>
						{#if !scopeAllAccounts}
							{#each data.accounts as acc (acc.id)}
								<button
									type="button"
									role="checkbox"
									class="flex items-center gap-1.5 py-0.5 cursor-pointer text-xs w-fit"
									aria-checked={scopeSelectedIds.includes(acc.id)}
									onclick={() => toggleScopeAccount(acc.id)}
								>
									<span class="font-bold">{scopeSelectedIds.includes(acc.id) ? '[X]' : '[ ]'}</span>
									<span class="{scopeSelectedIds.includes(acc.id) ? 'font-bold' : ''}">{acc.name}</span>
									<span class="text-gray-500">{acc.type}</span>
								</button>
							{/each}
							<div class="text-[10px] text-gray-600 mt-0.5">Unticked accounts are excluded from this target. Editable later via filters below.</div>
						{/if}
					</div>
					<div class="text-xs text-gray-600 mt-1">Set a monthly spending target to unlock progress tracking.</div>
				</form>
			{:else}
				<div class="text-sm text-gray-600">Target: <span class="font-bold text-black">Not set</span></div>
			{/if}
		</div>
	</div>

	<!-- CATEGORY TARGETS (expanded — this page IS the detail, D6) -->
	<div class="border border-black">
		<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
			<span>CATEGORY TARGETS</span>
			<span class="text-xs font-normal text-gray-600">{targetedCategories.length} targeted · {untargetedCategories.length} untargeted</span>
		</div>
		<div class="px-2 py-1 border-b border-black">
			<SubmitFeedback message={targetFeedback.message} onDismiss={targetFeedback.dismiss} />
			{#if targetedCategories.length > 0}
				<div class="text-gray-600 font-bold text-xs py-1">WITH TARGETS</div>
				{#each targetedCategories as cat (cat.id)}
					{@const prog = getCatProgress(cat.spent, cat.target ?? 0)}
					{@const pct = cat.target && cat.target > 0 ? Math.round((cat.spent / cat.target) * 100) : 0}
					{@const catMarker = amendmentMarker(`categoryTarget:${cat.id}`)}
					{#if editingCategoryId === cat.id}
						<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200 bg-amber-50 px-1">
							<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
							<span class="text-xs w-32 shrink-0">{cat.name}</span>
							<form method="POST" action="?/saveCategoryTarget" use:enhance={validatedAmountSubmit(targetFeedback, 'Saved')}>
								<input type="hidden" name="categoryId" value={cat.id} />
								<input type="hidden" name="note" value={amendNote} />
								<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
								<div class="flex items-center gap-1">
									<span class="text-xs">£</span>
									<input name="amount" type="text" value={editAmount} class="border border-black p-0.5 w-20 font-terminal text-xs bg-white" />
									<button type="submit" class="bracket-link text-xs text-green-700">Save</button>
									<button type="button" class="bracket-link text-xs" onclick={cancelEdit}>Cancel</button>
								</div>
							</form>
						</div>
					{:else}
						<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200">
							<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
							<span class="text-xs w-32 shrink-0">{cat.name}</span>
							<div class="flex items-center gap-0.5 text-xs min-w-[120px]">
								<span>[</span>
								<div class="flex-1 h-2 relative border-y border-gray-100">
									{#if prog.overBy !== null && (cat.target ?? 0) > 0}
										<div class="h-full {prog.color}" style="width: {(100 / pct) * 100}%"></div>
										<div class="h-full hatch-overflow absolute top-0" style="left: {(100 / pct) * 100}%; right: 0"></div>
									{:else}
										<div class="h-full {prog.color}" style="width: {prog.width}%"></div>
									{/if}
								</div>
								<span>]</span>
								<span class="min-w-6 font-bold {pct > 100 ? 'text-red-700' : pct > 75 ? 'text-amber-700' : 'text-green-700'}">{pct}%</span>
							</div>
							<span class="text-xs min-w-[70px] text-right">
								{formatCurrency(cat.spent)} <span class="text-gray-500">/</span> {formatCurrency(cat.target ?? 0)}
							</span>
							{#if prog.overBy !== null}
								<span class="text-[10px] text-red-700 font-bold whitespace-nowrap">
									{formatCurrency(prog.overBy)} over {formatCurrency(cat.target ?? 0)} target
								</span>
							{/if}
							<button class="bracket-link text-xs cursor-pointer" onclick={() => startEdit(cat.id, cat.target)}>Edit</button>
						</div>
						{#if catMarker}
							<div class="text-[10px] text-amber-700 pl-[144px] -mt-1 pb-0.5">{catMarker}</div>
						{/if}
					{/if}
				{/each}
			{/if}

			{#if untargetedWithSpend.length > 0}
				<div class="text-gray-600 font-bold text-xs py-1 {targetedCategories.length > 0 ? 'mt-1' : ''}">WITHOUT TARGETS</div>
				{#each untargetedWithSpend as cat (cat.id)}
					{#if editingCategoryId === cat.id}
						<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200 bg-amber-50 px-1">
							<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
							<span class="text-xs w-32 shrink-0">{cat.name}</span>
							<form method="POST" action="?/saveCategoryTarget" use:enhance={validatedAmountSubmit(targetFeedback, 'Saved')}>
								<input type="hidden" name="categoryId" value={cat.id} />
								<input type="hidden" name="note" value={amendNote} />
								<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
								<div class="flex items-center gap-1">
									<span class="text-xs">£</span>
									<input name="amount" type="text" value={editAmount} class="border border-black p-0.5 w-20 font-terminal text-xs bg-white" placeholder="0.00" />
									<button type="submit" class="bracket-link text-xs text-green-700">Save</button>
									<button type="button" class="bracket-link text-xs" onclick={cancelEdit}>Cancel</button>
								</div>
							</form>
						</div>
					{:else}
						<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200">
							<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
							<span class="text-xs w-32 shrink-0">{cat.name}</span>
							<span class="text-xs text-gray-600 min-w-[70px] text-right">{formatCurrency(cat.spent)} spent</span>
							<button class="bracket-link text-xs cursor-pointer" onclick={() => startEdit(cat.id, null)}>Set Target</button>
							{#if cat.id < 0 && cat.spent > 0}
								<a class="bracket-link text-xs" href="/overview/trends/{data.selectedMonth}/uncategorised">Triage</a>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}

			{#if untargetedZero.length > 0}
				<div class="text-gray-500 font-bold text-xs py-1">NO SPEND THIS MONTH</div>
				{#each untargetedZero as cat (cat.id)}
					<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200">
						<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
						<span class="text-xs w-32 shrink-0">{cat.name}</span>
						<button class="bracket-link text-xs cursor-pointer" onclick={() => startEdit(cat.id, null)}>Set Target</button>
					</div>
				{/each}
			{/if}

			{#if excludedCategories.length > 0}
				<div class="text-gray-500 font-bold text-xs py-1 mt-1 opacity-40">EXCLUDED (via filters below)</div>
				{#each excludedCategories as cat (cat.id)}
					<div class="flex items-center gap-2 py-1 opacity-40">
						<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
						<span class="text-xs w-32 shrink-0 line-through">{cat.name}</span>
						<span class="text-xs text-gray-500">—</span>
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<!-- FILTERS -->
	{#if data.budget}
		<div class="border border-black">
			<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
				<span>FILTERS</span>
				<span class="text-xs font-normal text-gray-600">
					{data.budget.excludedCategoryIds.length > 0 ? (data.categories.length - data.budget.excludedCategoryIds.length) + '/' + data.categories.length + ' cats' : 'all cats'}
					· {data.budget.excludedAccountIds.length > 0 ? (data.accounts.length - data.budget.excludedAccountIds.length) + '/' + data.accounts.length + ' accts' : 'all accts'}
					· {data.budget.excludedTypes.length > 0 ? (BUDGET_SPENDING_TYPES.length - data.budget.excludedTypes.length) + '/' + BUDGET_SPENDING_TYPES.length + ' types' : 'all types'}
				</span>
			</div>
			<div class="px-2 py-1 border-b border-black">
				<SubmitFeedback message={filterFeedback.message} onDismiss={filterFeedback.dismiss} />
				<div class="text-xs text-gray-600 py-1 border-b border-dotted border-gray-200">
					Spending = withdrawals + card charges − refunds. Transfers and debt payments are excluded.
				</div>
				<div class="text-gray-600 font-bold text-xs py-1">CATEGORIES</div>
				{#each data.categories as cat (cat.id)}
					{@const excluded = data.budget.excludedCategoryIds.includes(cat.id)}
					<form method="POST" action="?/toggleCategory" use:enhance={filterFeedback.createEnhanceHandler('Saved')} class="inline w-full">
						<input type="hidden" name="categoryId" value={cat.id} />
						<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<button type="submit" role="checkbox" aria-checked={!excluded} class="flex items-center gap-1.5 py-1 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
							<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
							<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
							<span class="text-xs {excluded ? 'line-through' : ''}">{cat.name}</span>
						</button>
					</form>
				{/each}

				<div class="text-gray-600 font-bold text-xs py-1 mt-2 border-t border-dotted border-gray-200">ACCOUNTS</div>
				{#each data.accounts as acc (acc.id)}
					{@const excluded = data.budget.excludedAccountIds.includes(acc.id)}
					<form method="POST" action="?/toggleAccount" use:enhance={filterFeedback.createEnhanceHandler('Saved')} class="inline w-full">
						<input type="hidden" name="accountId" value={acc.id} />
						<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<button type="submit" role="checkbox" aria-checked={!excluded} class="flex items-center gap-1.5 py-1 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
							<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
							<span class="text-xs {excluded ? 'line-through' : ''}">{acc.name}</span>
							<span class="text-xs text-gray-500">{acc.type}</span>
						</button>
					</form>
				{/each}

				<div class="text-gray-600 font-bold text-xs py-1 mt-2 border-t border-dotted border-gray-200">TYPES</div>
				{#each BUDGET_SPENDING_TYPES as t (t)}
					{@const excluded = data.budget.excludedTypes.includes(t)}
					<form method="POST" action="?/toggleType" use:enhance={filterFeedback.createEnhanceHandler('Saved')} class="inline w-full">
						<input type="hidden" name="type" value={t} />
						<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<button type="submit" role="checkbox" aria-checked={!excluded} class="flex items-center gap-1.5 py-1 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
							<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
							<span class="text-xs {excluded ? 'line-through' : ''}">{TRANSACTION_TYPE_LABELS[t]}</span>
							{#if t === 'refund'}
								<span class="text-[10px] text-gray-500">nets against spending</span>
							{/if}
						</button>
					</form>
				{/each}
			</div>
		</div>
	{/if}

	<!-- AMENDMENTS LOG -->
	{#if data.budget}
		<div class="border border-black">
			<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
				<span>AMENDMENTS</span>
				<span class="text-xs font-normal text-gray-600">{data.amendments.length} change{data.amendments.length === 1 ? '' : 's'}</span>
			</div>
			<div class="px-2 py-1">
				{#if data.amendments.length === 0}
					<div class="text-xs text-gray-600 py-1">No amendments recorded for this month. Config edits are trailed automatically.</div>
				{:else}
					<div class="text-[10px] text-gray-600 py-0.5">Newest first. Transactions are immutable — only config changes appear here.</div>
					{#each data.amendments as amendment (amendment.id)}
						<div class="flex flex-wrap items-baseline gap-x-1.5 py-0.5 border-b border-dotted border-gray-100 text-xs">
							<span class="text-gray-600 w-20 shrink-0">{formatAmendmentDate(amendment.createdAt)}</span>
							<span class="font-bold">{amendmentFieldLabel(amendment.field)}</span>
							<span>{formatAmendmentValue(amendment.field, amendment.oldValue)}</span>
							<span class="text-gray-600">&rarr;</span>
							<span class="font-bold">{formatAmendmentValue(amendment.field, amendment.newValue)}</span>
							{#if amendment.note}
								<span class="text-gray-600">({amendment.note})</span>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex justify-between items-center text-xs">
		<a href="/overview/trends/{data.selectedMonth}" class="bracket-link">← Back to the month</a>
		<a href="/overview/trends/insights?month={data.selectedMonth}" class="bracket-link">Spending insights</a>
	</div>
</div>
