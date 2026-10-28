<script lang="ts">
	import { enhance } from "$app/forms";
	import { formatCurrency } from "$lib/utils/currency";
	import PaginationClient from "$lib/components/PaginationClient.svelte";
	import SubmitFeedback from "$lib/components/SubmitFeedback.svelte";
	import { useSubmitFeedback } from "$lib/utils/use-submit-feedback.svelte";
	import { useUrlPagination } from "$lib/utils/use-url-pagination.svelte";
	import {
		BUDGET_SPENDING_TYPES,
		TRANSACTION_TYPE_LABELS,
	} from "$lib/utils/domain-constants";
	import type { PageData, ActionData } from "./$types";
	import type { AmendmentTimelineEntry } from "$lib/types/budget";

	let { data }: { data: PageData; form: ActionData } = $props();

	// ── Form feedback (audit #5): shared composable, consistent copy ──
	const targetFeedback = useSubmitFeedback();
	const filterFeedback = useSubmitFeedback();

	// ── History pagination: URL-synced via goto (router-safe) ──
	const historyPagination = useUrlPagination("page");
	$effect(() => {
		historyPagination.page = data.history.pagination.page;
	});

	// ── Amendment options shared by every config form (task 4.3) ──
	let amendNote = $state("");
	let applyForward = $state(false);

	// Accordion state
	let targetOpen = $state(true); // Auto-open if no budget
	$effect(() => {
		targetOpen = !data.budget;
	});
	let filtersOpen = $state(false);
	let amendmentsOpen = $state(false);

	// Editing state for category targets
	let editingCategoryId = $state<number | null>(null);
	let editAmount = $state("");

	// Budget creation scoping (task 3.1): explicit choice, no silent default
	let scopeAllAccounts = $state(false);
	let scopeSelectedIds = $state<number[]>([]);

	// Derived helpers
	let spentPercent = $derived(
		data.budget && data.budget.totalTargetInCents > 0
			? Math.round((data.status.totalSpent / data.budget.totalTargetInCents) * 100)
			: 0,
	);

	let remaining = $derived(
		data.budget ? data.budget.totalTargetInCents - data.status.totalSpent : 0,
	);

	let pacePercent = $derived(
		data.status.totalDays > 0
			? Math.round((data.status.daysElapsed / data.status.totalDays) * 100)
			: 0,
	);

	let progressColor = $derived(
		spentPercent > 100 ? "bg-red-700" : spentPercent > 75 ? "bg-amber-600" : "bg-green-700",
	);

	let progressTextColor = $derived(
		spentPercent > 100 ? "text-red-700" : spentPercent > 75 ? "text-amber-600" : "text-green-700",
	);

	let statusLabel = $derived(
		spentPercent > 100
			? { text: "over budget", class: "text-red-700" }
			: spentPercent > 75
				? { text: "getting close", class: "text-amber-600" }
				: { text: "on track", class: "text-green-700" },
	);

	let targetedCategories = $derived(
		data.categoryBreakdown.filter((c) => c.target !== null),
	);

	let untargetedCategories = $derived(
		data.categoryBreakdown.filter((c) => c.target === null && !data.budget?.excludedCategoryIds.includes(c.id)),
	);

	let excludedCategories = $derived(
		data.categoryBreakdown.filter((c) => data.budget?.excludedCategoryIds.includes(c.id)),
	);

	// History pagination
	let historyRef = $state<HTMLElement | null>(null);

	// ── Amendment helpers (task 4.4) ──
	function latestAmendment(field: string): AmendmentTimelineEntry | null {
		return data.amendments.find((a) => a.field === field) ?? null;
	}

	function formatAmendmentValue(field: string, value: unknown): string {
		if (value === null || value === undefined) return "—";
		if (
			field === "totalTargetInCents" ||
			field.startsWith("categoryTarget:")
		) {
			return formatCurrency(Number(value));
		}
		if (Array.isArray(value)) {
			if (field === "excludedTypes") {
				return value.length === 0 ? "(none)" : value.map((t) => TRANSACTION_TYPE_LABELS[t as keyof typeof TRANSACTION_TYPE_LABELS] ?? t).join(", ");
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
			case "totalTargetInCents":
				return "Total target";
			case "excludedCategoryIds":
				return "Excluded categories";
			case "excludedAccountIds":
				return "Excluded accounts";
			case "excludedTypes":
				return "Excluded types";
			default:
				return field;
		}
	}

	function formatAmendmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString("en-GB", {
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	}

	function amendmentMarker(field: string): string | null {
		const amendment = latestAmendment(field);
		if (!amendment) return null;
		return `[amended ${formatAmendmentDate(amendment.createdAt)} — was ${formatAmendmentValue(field, amendment.oldValue)}]`;
	}

	function getMonthLabel(monthStr: string): string {
		const [y, m] = monthStr.split("-");
		const date = new Date(Number(y), Number(m) - 1);
		return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
	}

	function getPrevMonth(monthStr: string): string {
		const [y, m] = monthStr.split("-").map(Number);
		const d = new Date(y, m - 2, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	}

	function getNextMonth(monthStr: string): string | null {
		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		if (monthStr >= currentMonth) return null;
		const [y, m] = monthStr.split("-").map(Number);
		const d = new Date(y, m, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	}

	function getHistoryStatus(target: number, actual: number): { label: string; class: string } {
		if (target === 0) return { label: "—", class: "text-gray-400" };
		const pct = Math.round((actual / target) * 100);
		if (pct > 100) return { label: `OVER +${pct - 100}%`, class: "text-red-700 font-bold" };
		if (pct >= 95) return { label: `UNDER -${100 - pct}%`, class: "text-amber-600 font-bold" };
		return { label: `UNDER -${100 - pct}%`, class: "text-green-700 font-bold" };
	}

	function getCatProgress(spent: number, target: number): {
		width: number;
		color: string;
		overBy: number | null;
	} {
		// #7: return the UNCAPPED pct so over-target rows read red, and expose
		// the overage so the row can hatch its overflow + label "£X over £Y"
		const rawPct = target > 0 ? Math.round((spent / target) * 100) : 0;
		const color = rawPct > 100 ? "bg-red-700" : rawPct > 75 ? "bg-amber-600" : "bg-green-700";
		return {
			width: Math.min(rawPct, 100),
			color,
			overBy: rawPct > 100 ? spent - target : null,
		};
	}

	function startEdit(categoryId: number, currentTarget: number | null) {
		editingCategoryId = categoryId;
		editAmount = currentTarget ? (currentTarget / 100).toFixed(2) : "";
	}

	function cancelEdit() {
		editingCategoryId = null;
		editAmount = "";
	}

	// ── Client-side validation (task 1.2), matching server rules ──
	const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

	function validatedAmountSubmit(
		feedback: ReturnType<typeof useSubmitFeedback>,
		successText: string,
	) {
		return (input: { formData: FormData; cancel: () => void }) => {
			const amount = String(input.formData.get("amount") ?? "").trim();
			if (!AMOUNT_PATTERN.test(amount)) {
				feedback.message = {
					type: "error",
					text: "Enter a valid amount like 123.45",
				};
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
			targetFeedback.message = {
				type: "error",
				text: "Enter a valid amount like 123.45",
			};
			input.cancel();
			return;
		}
		const allAccounts = input.formData.get("allAccounts") === "on";
		const selected = input.formData.getAll("accountIds");
		if (!allAccounts && selected.length === 0) {
			targetFeedback.message = {
				type: "error",
				text: "Choose accounts for this budget or tick All accounts",
			};
			input.cancel();
			return;
		}
		return targetFeedback.createEnhanceHandler("Budget saved")();
	}
</script>

<div class="border-t border-black">
	<!-- HEADER SECTION -->
	<div class="border-b border-black p-2 flex justify-between items-start">
		<div>
			<h1 class="text-lg font-bold m-0 uppercase">Monthly Budget</h1>
			<div class="text-sm text-gray-600 mt-1">
				{getMonthLabel(data.selectedMonth)}
			</div>
			<div class="text-xs text-gray-600">
				{data.status.daysElapsed} of {data.status.totalDays} days elapsed
				{#if data.budget}
					&middot; {formatCurrency(data.status.totalSpent)} spent
				{/if}
				{#if !data.isCurrentMonth}
					&middot; <span class="text-gray-400">Historical — config editable, transactions immutable</span>
				{/if}
			</div>
		</div>
		<div class="flex flex-col items-end gap-2">
			<div class="flex gap-2 mb-1">
				<a href="/overview/budgets/all" class="bracket-link text-xs">[All Months]</a>
			</div>
			<div class="text-[10px] uppercase font-bold text-gray-600">Month</div>
			<div class="flex gap-1 items-center">
				<a href="/overview/budgets/{getPrevMonth(data.selectedMonth)}" class="bracket-link text-xs" data-sveltekit-noscroll>[Prev]</a>
				<span class="bracket-link bg-black text-white text-xs px-1">{getMonthLabel(data.selectedMonth)}</span>
				{#if getNextMonth(data.selectedMonth)}
					<a href="/overview/budgets/{getNextMonth(data.selectedMonth)}" class="bracket-link text-xs" data-sveltekit-noscroll>[Next]</a>
				{:else}
					<span class="text-xs text-gray-400">[Next]</span>
				{/if}
			</div>
		</div>
</div>

	<!-- AMENDMENT OPTIONS (shared by every config form below) -->
	{#if data.budget}
		<div class="border-b border-black px-2 py-1 bg-gray-50 flex flex-wrap items-center gap-x-4 gap-y-1">
			<span class="text-[10px] uppercase font-bold text-gray-600">Amendment options</span>
			<label class="flex items-center gap-1 text-xs text-gray-600">
				<span>Note</span>
				<input
					type="text"
					bind:value={amendNote}
					maxlength="200"
					placeholder="optional — why is this changing?"
					class="border border-gray-300 px-1 py-0.5 w-52 font-terminal text-xs"
				/>
			</label>
			<div class="flex items-center gap-3 text-xs text-gray-600">
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="radio" name="applyScope" value="month" checked={!applyForward} onchange={() => (applyForward = false)} class="cursor-pointer" />
					<span>this month only</span>
				</label>
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="radio" name="applyScope" value="forward" checked={applyForward} onchange={() => (applyForward = true)} class="cursor-pointer" />
					<span>this + future months (each trailed in history)</span>
				</label>
			</div>
		</div>
	{/if}

	<!-- TARGET ACCORDION -->
	<button
		class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1.5 text-sm bg-white border-b border-black"
		onclick={() => (targetOpen = !targetOpen)}
	>
		<span class="flex items-center gap-2">
			TARGET / MO
			{#if data.budget}
				<span class="{remaining >= 0 ? 'text-green-700' : 'text-red-700'} font-bold text-xs">
					{remaining >= 0 ? formatCurrency(remaining) + ' remaining' : formatCurrency(Math.abs(remaining)) + ' over'}
				</span>
				<span class="text-gray-400 text-[10px]">· sum of category targets</span>
			{:else}
				<span class="text-gray-400 text-xs">not set</span>
			{/if}
		</span>
		<span class="text-xs text-gray-400">details {targetOpen ? '[-]' : '[+]'}</span>
	</button>

	{#if targetOpen}
		<div class="border-b border-black px-2 py-2">
			{#if data.budget}
				<div class="text-sm text-gray-500 mb-1">
					Total (sum of category targets): <span class="font-bold text-black">{formatCurrency(data.budget.totalTargetInCents)}</span>
					{#if amendmentMarker('totalTargetInCents')}
						<span class="text-[10px] text-amber-700 ml-1">{amendmentMarker('totalTargetInCents')}</span>
					{/if}
				</div>
				<div class="text-xs text-gray-400">Set individual category targets below to adjust.</div>
			{:else if data.isCurrentMonth}
				<form method="POST" action="?/saveTarget" use:enhance={validatedCreateSubmit}>
					<div class="flex items-center gap-2 text-sm">
						<span class="text-xs">Target</span>
						<span>£</span>
						<input name="amount" type="text" class="border border-black p-1 w-28 font-terminal text-sm" placeholder="0.00" />
						<button type="submit" class="bracket-link text-xs" disabled={targetFeedback.isSubmitting}>
							{targetFeedback.isSubmitting ? 'Saving...' : 'Save'}
						</button>
					</div>
					<input type="hidden" name="note" value={amendNote} />
					<!-- Scoping step: which accounts does this budget cover? -->
					<div class="mt-2 border border-dotted border-gray-300 p-1.5">
						<div class="text-gray-500 font-bold text-xs py-0.5">SCOPE — WHICH ACCOUNTS DOES THIS BUDGET COVER?</div>
						<label class="flex items-center gap-1.5 py-0.5 cursor-pointer text-xs">
							<input type="checkbox" name="allAccounts" bind:checked={scopeAllAccounts} class="cursor-pointer" />
							<span class="font-bold">{scopeAllAccounts ? '[X]' : '[ ]'}</span>
							<span>All accounts</span>
						</label>
						{#if !scopeAllAccounts}
							{#each data.accounts as acc (acc.id)}
								<label class="flex items-center gap-1.5 py-0.5 cursor-pointer text-xs w-fit">
									<input type="checkbox" name="accountIds" value={acc.id} bind:group={scopeSelectedIds} class="cursor-pointer" />
									<span class="font-bold">{scopeSelectedIds.includes(acc.id) ? '[X]' : '[ ]'}</span>
									<span>{acc.name}</span>
									<span class="text-gray-400">{acc.type}</span>
								</label>
							{/each}
							<div class="text-[10px] text-gray-400 mt-0.5">Unticked accounts are excluded from this budget. Editable later via the account panel.</div>
						{/if}
					</div>
					<div class="text-xs text-gray-400 mt-1">Set a monthly spending target to unlock progress tracking.</div>
				</form>
			{:else}
				<div class="text-sm text-gray-500">
					Target: <span class="font-bold text-black">Not set</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- PROGRESS BAR (always visible if budget set) -->
	{#if data.budget && data.budget.totalTargetInCents > 0}
		<div class="border-b border-black px-2 py-2">
			<div class="flex items-center gap-1 text-xs leading-none mb-1">
				<span>[</span>
				<div class="flex-1 h-3 relative border-y border-gray-100">
					{#if spentPercent > 100}
						<!-- #7: solid = target's share of spend, hatch = overflow -->
						<div class="h-full {progressColor}" style="width: {(100 / spentPercent) * 100}%"></div>
						<div class="h-full hatch-overflow absolute top-0" style="left: {(100 / spentPercent) * 100}%; right: 0"></div>
					{:else}
						<div class="h-full {progressColor}" style="width: {Math.min(spentPercent, 100)}%"></div>
					{/if}
				</div>
				<span>]</span>
				<span class="min-w-8 font-bold {progressTextColor}">{spentPercent}%</span>
			</div>
			{#if spentPercent > 100}
				<div class="text-xs text-red-700 font-bold">
					[!] {formatCurrency(data.status.totalSpent - data.budget.totalTargetInCents)} over {formatCurrency(data.budget.totalTargetInCents)} target
				</div>
			{/if}
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Spent so far</span>
				<span>{formatCurrency(data.status.totalSpent)} <span class="text-gray-400">of</span> {formatCurrency(data.budget.totalTargetInCents)}</span>
			</div>
			<div class="flex justify-between text-xs text-gray-400">
				<span>{data.status.daysElapsed} of {data.status.totalDays} days elapsed</span>
				<span>{Math.round((data.status.daysElapsed / data.status.totalDays) * 100)}% of month</span>
			</div>
		</div>
	{/if}

	<!-- SPENDING SUMMARY (when no budget) -->
	{#if !data.budget}
		<div class="border-b border-black px-2 py-2">
			<div class="flex justify-between font-bold">
				<span>THIS MONTH</span>
				<span>{formatCurrency(data.status.totalSpent)}</span>
			</div>
			<div class="flex justify-between text-xs text-gray-400">
				<span>{data.status.daysElapsed} of {data.status.totalDays} days elapsed</span>
				<span>Avg {formatCurrency(Math.round(data.status.avgPerDay))}/day</span>
			</div>
			<div class="text-xs text-gray-400 mt-1">Spending = withdrawals + card charges − refunds. Transfers and debt payments are excluded.</div>
		</div>
	{/if}

	<!-- SPENDING PACE -->
	{#if data.budget && data.budget.totalTargetInCents > 0}
		<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-t border-black">SPENDING PACE <span class="{statusLabel.class}">{statusLabel.text}</span></div>
		<div class="px-2 py-2 border-b border-gray-300">
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Avg/day</span>
				<span>{formatCurrency(Math.round(data.status.avgPerDay))}</span>
			</div>
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Projected total</span>
				<span class="{spentPercent > 100 ? 'text-red-700' : ''}">{formatCurrency(Math.round(data.status.projectedTotal))}</span>
			</div>
			<div class="mt-2">
				<div class="flex h-1.5 border border-gray-300 relative">
					<div class="h-full bg-black" style="width: {Math.min(spentPercent, 100)}%"></div>
					<div class="absolute -top-0.5 -bottom-0.5 w-0.5 bg-green-700" style="left: {pacePercent}%"></div>
				</div>
				<div class="text-xs text-gray-400 mt-1">
					Spending {spentPercent}% | Time {pacePercent}% — <span class="{statusLabel.class}">{statusLabel.text}</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- FILTERS ACCORDION -->
	{#if data.budget}
		<button
			class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1 text-xs bg-gray-50 border-t border-black"
			onclick={() => (filtersOpen = !filtersOpen)}
		>
			<span>FILTERS <span class="text-gray-400">{data.budget.excludedCategoryIds.length > 0 ? (data.categories.length - data.budget.excludedCategoryIds.length) + '/' + data.categories.length + ' cats' : 'all cats'} · {data.budget.excludedAccountIds.length > 0 ? (data.accounts.length - data.budget.excludedAccountIds.length) + '/' + data.accounts.length + ' accts' : 'all accts'} · {data.budget.excludedTypes.length > 0 ? (BUDGET_SPENDING_TYPES.length - data.budget.excludedTypes.length) + '/' + BUDGET_SPENDING_TYPES.length + ' types' : 'all types'}</span></span>
			<span class="text-xs text-gray-400">{filtersOpen ? '[-]' : '[+]'}</span>
		</button>
		<SubmitFeedback message={filterFeedback.message} onDismiss={filterFeedback.dismiss} />
		{#if filtersOpen}
			<div class="px-2 py-1 border-b border-gray-300">
				<div class="text-xs text-gray-400 py-1 border-b border-dotted border-gray-200">
					Spending = withdrawals + card charges − refunds. Transfers and debt payments are excluded.
				</div>
				<div class="text-gray-500 font-bold text-xs py-1">CATEGORIES</div>
				{#each data.categories as cat (cat.id)}
					{@const excluded = data.budget.excludedCategoryIds.includes(cat.id)}
					<form method="POST" action="?/toggleCategory" use:enhance={filterFeedback.createEnhanceHandler('Saved')} class="inline w-full">
						<input type="hidden" name="categoryId" value={cat.id} />
						<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<button type="submit" class="flex items-center gap-1.5 py-0.5 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
							<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
							<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
							<span class="text-xs {excluded ? 'line-through' : ''}">{cat.name}</span>
						</button>
					</form>
				{/each}

				<div class="text-gray-500 font-bold text-xs py-1 mt-2 border-t border-dotted border-gray-200">ACCOUNTS</div>
				{#each data.accounts as acc (acc.id)}
					{@const excluded = data.budget.excludedAccountIds.includes(acc.id)}
					<form method="POST" action="?/toggleAccount" use:enhance={filterFeedback.createEnhanceHandler('Saved')} class="inline w-full">
						<input type="hidden" name="accountId" value={acc.id} />
						<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<button type="submit" class="flex items-center gap-1.5 py-0.5 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
							<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
							<span class="text-xs {excluded ? 'line-through' : ''}">{acc.name}</span>
							<span class="text-xs text-gray-400">{acc.type}</span>
						</button>
					</form>
				{/each}

				<div class="text-gray-500 font-bold text-xs py-1 mt-2 border-t border-dotted border-gray-200">TYPES</div>
				{#each BUDGET_SPENDING_TYPES as t (t)}
					{@const excluded = data.budget.excludedTypes.includes(t)}
					<form method="POST" action="?/toggleType" use:enhance={filterFeedback.createEnhanceHandler('Saved')} class="inline w-full">
						<input type="hidden" name="type" value={t} />
						<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<button type="submit" class="flex items-center gap-1.5 py-0.5 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
							<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
							<span class="text-xs {excluded ? 'line-through' : ''}">{TRANSACTION_TYPE_LABELS[t]}</span>
							{#if t === 'refund'}
								<span class="text-[10px] text-gray-400">nets against spending</span>
							{/if}
						</button>
					</form>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- CATEGORY TARGETS -->
	<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-t border-black">CATEGORY TARGETS <span class="text-gray-400">{targetedCategories.length} targeted · {untargetedCategories.length} untargeted</span></div>
	<SubmitFeedback message={targetFeedback.message} onDismiss={targetFeedback.dismiss} />
	<div class="px-2 py-1 border-b border-gray-300">
		{#if targetedCategories.length > 0}
			<div class="text-gray-500 font-bold text-xs py-1">WITH TARGETS</div>
			{#each targetedCategories as cat (cat.id)}
				{@const prog = getCatProgress(cat.spent, cat.target ?? 0)}
				{@const pct = cat.target && cat.target > 0 ? Math.round((cat.spent / cat.target) * 100) : 0}
				{@const catMarker = amendmentMarker(`categoryTarget:${cat.id}`)}

				{#if editingCategoryId === cat.id}
					<!-- Inline edit mode -->
					<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200 bg-amber-50 px-1">
						<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
						<span class="text-xs w-32 shrink-0">{cat.name}</span>
						<form method="POST" action="?/saveCategoryTarget" use:enhance={validatedAmountSubmit(targetFeedback, 'Saved')}>
							<input type="hidden" name="categoryId" value={cat.id} />
							<input type="hidden" name="note" value={amendNote} />
							<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
							<div class="flex items-center gap-1">
								<span class="text-xs">£</span>
								<input name="amount" type="text" value={editAmount} class="border border-black p-0.5 w-20 font-terminal text-xs" />
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
									<!-- #7: solid = target's share, hatch = overflow -->
									<div class="h-full {prog.color}" style="width: {(100 / pct) * 100}%"></div>
									<div class="h-full hatch-overflow absolute top-0" style="left: {(100 / pct) * 100}%; right: 0"></div>
								{:else}
									<div class="h-full {prog.color}" style="width: {prog.width}%"></div>
								{/if}
							</div>
							<span>]</span>
							<span class="min-w-6 font-bold {pct > 100 ? 'text-red-700' : pct > 75 ? 'text-amber-600' : 'text-green-700'}">{pct}%</span>
						</div>
						<span class="text-xs min-w-[70px] text-right">
							{formatCurrency(cat.spent)} <span class="text-gray-400">/</span> {formatCurrency(cat.target ?? 0)}
						</span>
						{#if prog.overBy !== null}
							<span class="text-[10px] text-red-700 font-bold whitespace-nowrap">
								{formatCurrency(prog.overBy)} over {formatCurrency(cat.target ?? 0)} target
							</span>
						{/if}
						<button class="bracket-link text-xs" onclick={() => startEdit(cat.id, cat.target)}>Edit</button>
					</div>
					{#if catMarker}
						<div class="text-[10px] text-amber-700 pl-[144px] -mt-1 pb-0.5">{catMarker}</div>
					{/if}
				{/if}
			{/each}
		{/if}

		{#if untargetedCategories.length > 0}
			<div class="text-gray-500 font-bold text-xs py-1 {targetedCategories.length > 0 ? 'mt-1' : ''}">WITHOUT TARGETS</div>
			{#each untargetedCategories as cat (cat.id)}
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
								<input name="amount" type="text" value={editAmount} class="border border-black p-0.5 w-20 font-terminal text-xs" placeholder="0.00" />
								<button type="submit" class="bracket-link text-xs text-green-700">Save</button>
								<button type="button" class="bracket-link text-xs" onclick={cancelEdit}>Cancel</button>
							</div>
						</form>
					</div>
				{:else}
					<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200">
						<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
						<span class="text-xs w-32 shrink-0">{cat.name}</span>
						<span class="text-xs text-gray-400 min-w-[70px] text-right">{formatCurrency(cat.spent)} spent</span>
						<button class="bracket-link text-xs" onclick={() => startEdit(cat.id, null)}>Set Target</button>
					</div>
				{/if}
			{/each}
		{/if}

		{#if editingCategoryId && !targetedCategories.find(c => c.id === editingCategoryId) && !untargetedCategories.find(c => c.id === editingCategoryId)}
			{@const cat = data.categories.find(c => c.id === editingCategoryId)}
			{#if cat}
				<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200 bg-amber-50 px-1">
					<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
					<span class="text-xs w-32 shrink-0">{cat.name}</span>
					<form method="POST" action="?/saveCategoryTarget" use:enhance={validatedAmountSubmit(targetFeedback, 'Saved')}>
						<input type="hidden" name="categoryId" value={cat.id} />
						<input type="hidden" name="note" value={amendNote} />
						<input type="hidden" name="applyForward" value={applyForward ? 'true' : 'false'} />
						<div class="flex items-center gap-1">
							<span class="text-xs">£</span>
							<input name="amount" type="text" value={editAmount} class="border border-black p-0.5 w-20 font-terminal text-xs" placeholder="0.00" />
							<button type="submit" class="bracket-link text-xs text-green-700">Save</button>
							<button type="button" class="bracket-link text-xs" onclick={cancelEdit}>Cancel</button>
						</div>
					</form>
				</div>
			{/if}
		{/if}

		{#if excludedCategories.length > 0}
			<div class="text-gray-500 font-bold text-xs py-1 mt-1 opacity-40">EXCLUDED</div>
			{#each excludedCategories as cat (cat.id)}
				<div class="flex items-center gap-2 py-1 opacity-40">
					<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
					<span class="text-xs w-20 shrink-0 line-through">{cat.name}</span>
					<span class="text-xs text-gray-400">—</span>
				</div>
			{/each}
		{/if}
	</div>

	<!-- AMENDMENTS (task 4.4) -->
	{#if data.budget}
		<button
			class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1 text-xs bg-gray-50 border-t border-black"
			onclick={() => (amendmentsOpen = !amendmentsOpen)}
		>
			<span>AMENDMENTS <span class="text-gray-400">{data.amendments.length} change{data.amendments.length === 1 ? '' : 's'}</span></span>
			<span class="text-xs text-gray-400">{amendmentsOpen ? '[-]' : '[+]'}</span>
		</button>
		{#if amendmentsOpen}
			<div class="px-2 py-1 border-b border-gray-300">
				{#if data.amendments.length === 0}
					<div class="text-xs text-gray-400 py-1">No amendments recorded for this month. Config edits are trailed automatically.</div>
				{:else}
					<div class="text-[10px] text-gray-400 py-0.5">Transactions are immutable — only config changes appear here, newest first.</div>
					{#each data.amendments as amendment (amendment.id)}
						<div class="flex flex-wrap items-baseline gap-x-1.5 py-0.5 border-b border-dotted border-gray-100 text-xs">
							<span class="text-gray-500 w-20 shrink-0">{formatAmendmentDate(amendment.createdAt)}</span>
							<span class="font-bold">{amendmentFieldLabel(amendment.field)}</span>
							<span>{formatAmendmentValue(amendment.field, amendment.oldValue)}</span>
							<span class="text-gray-400">&rarr;</span>
							<span class="font-bold">{formatAmendmentValue(amendment.field, amendment.newValue)}</span>
							{#if amendment.note}
								<span class="text-gray-400">({amendment.note})</span>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	{/if}

	<!-- HISTORY -->
	<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-t border-black">HISTORY <span class="text-gray-400">{data.history.months.length} months</span></div>
	<div class="px-2 py-1 border-b border-gray-300" bind:this={historyRef}>
		{#if data.history.months.length > 0}
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr>
						<th class="text-left p-0.5 border-b border-gray-300 text-gray-500 font-normal">Month</th>
						<th class="text-right p-0.5 border-b border-gray-300 text-gray-500 font-normal">Target</th>
						<th class="text-right p-0.5 border-b border-gray-300 text-gray-500 font-normal">Actual</th>
						<th class="text-right p-0.5 border-b border-gray-300 text-gray-500 font-normal">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.history.months as h (h.month)}
						{@const status = getHistoryStatus(h.totalTarget, h.actualSpent)}
						<tr class="border-b border-dotted border-gray-200">
							<td class="p-0.5"><a href="/overview/budgets/{h.month}" class="bracket-link">{getMonthLabel(h.month)}</a></td>
							<td class="p-0.5 text-right">{formatCurrency(h.totalTarget)}</td>
							<td class="p-0.5 text-right">{formatCurrency(h.actualSpent)}</td>
							<td class="p-0.5 text-right {status.class}">{status.label}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		<PaginationClient
			page={historyPagination.page}
			totalPages={data.history.pagination.totalPages}
			onPageChange={historyPagination.updatePage}
			scrollTarget={historyRef}
		/>
		{:else}
			<div class="text-xs text-gray-400 py-1">No history yet.</div>
		{/if}
	</div>
</div>
