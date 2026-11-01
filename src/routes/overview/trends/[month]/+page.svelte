<script lang="ts">
	import { formatCurrency } from "$lib/utils/currency";
	import PaginationClient from "$lib/components/PaginationClient.svelte";
	import { TRANSACTION_TYPE_LABELS } from "$lib/utils/domain-constants";
	import BurnDownChart from "$lib/components/charts/BurnDownChart.svelte";
	import { useUrlPagination } from "$lib/utils/use-url-pagination.svelte";
	import type { PageData, ActionData } from "./$types";
	import type { AmendmentTimelineEntry } from "$lib/types/budget";

	let { data }: { data: PageData; form: ActionData } = $props();


	// ── History pagination: URL-synced via goto (router-safe) ──
	const historyPagination = useUrlPagination("page");
	$effect(() => {
		historyPagination.page = data.history.pagination.page;
	});



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
		spentPercent > 100 ? "text-red-700" : spentPercent > 75 ? "text-amber-700" : "text-green-700",
	);

	let statusLabel = $derived(
		spentPercent > 100
			? { text: "over budget", class: "text-red-700" }
			: spentPercent > 75
				? { text: "getting close", class: "text-amber-700" }
				: { text: "on track", class: "text-green-700" },
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
		if (target === 0) return { label: "—", class: "text-gray-500" };
		const pct = Math.round((actual / target) * 100);
		if (pct > 100) return { label: `OVER +${pct - 100}%`, class: "text-red-700 font-bold" };
		if (pct >= 95) return { label: `UNDER -${100 - pct}%`, class: "text-amber-700 font-bold" };
		return { label: `UNDER -${100 - pct}%`, class: "text-green-700 font-bold" };
	}
</script>

<!-- v3.1 border unification: inset panel frame -->
<div class="p-2 flex flex-col gap-2">
	<!-- HEADER SECTION -->
	<div class="border border-black p-2 flex justify-between items-start">
		<div>
			<h1 class="text-lg font-bold m-0 uppercase">Monthly Trend</h1>
			<div class="text-sm text-gray-600 mt-1">
				{getMonthLabel(data.selectedMonth)}
			</div>
			<div class="text-xs text-gray-600">
				{data.status.daysElapsed} of {data.status.totalDays} days elapsed
				{#if data.budget}
					&middot; {formatCurrency(data.status.totalSpent)} spent
				{/if}
				{#if data.isCurrentMonth}
					&middot; <span class="text-gray-500">statement-based: figures firm up as last month's statements are entered</span>
				{:else}
					&middot; <span class="text-gray-500">Historical — config editable, transactions immutable</span>
				{/if}
			</div>
		</div>
		<div class="flex flex-col items-end gap-2">
			<div class="flex gap-2 mb-1">
				<!-- v3.2 V4: config + amendments live on their own page -->
				<a href="/overview/trends/{data.selectedMonth}/config" class="bracket-link text-xs font-bold">Config & amendments</a>
				<a href="/overview/trends/all" class="bracket-link text-xs">All Months</a>
				<!-- #20: print/PDF affordance — global print CSS strips nav/forms/actions -->
				<button type="button" class="bracket-link text-xs" onclick={() => window.print()}>Print / PDF</button>
			</div>
			<div class="text-[10px] uppercase font-bold text-gray-600">Month</div>
			<div class="flex gap-1 items-center">
				<a href="/overview/trends/{getPrevMonth(data.selectedMonth)}" class="bracket-link text-xs" data-sveltekit-noscroll>Prev</a>
				<span class="bracket-link bg-black text-white text-xs px-1">{getMonthLabel(data.selectedMonth)}</span>
				{#if getNextMonth(data.selectedMonth)}
					<a href="/overview/trends/{getNextMonth(data.selectedMonth)}" class="bracket-link text-xs" data-sveltekit-noscroll>Next</a>
				{:else}
					<span class="text-xs text-gray-500">[Next]</span>
				{/if}
			</div>
		</div>
</div>

	<!-- SUMMARY STRIP (R9): the four numbers that answer the month, at a glance -->
	{#if data.budget && data.budget.totalTargetInCents > 0}
		<div class="border border-black grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-300">
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">Status</div>
				<div class="text-sm font-bold {statusLabel.class}">{statusLabel.text}</div>
				<div class="text-[10px] text-gray-500">{spentPercent}% of target spent</div>
			</div>
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">Spent / target</div>
				<div class="text-sm font-bold">{formatCurrency(data.status.totalSpent)}</div>
				<div class="text-[10px] text-gray-500">
					of {formatCurrency(data.budget.totalTargetInCents)}
					<!-- v3.1 A08 harvest: name the target's source so a first-timer
					     can trace £X to its config -->
					{#if (data.categoryBreakdown ?? []).filter((c) => c.target).length > 0}
						· sum of category targets
					{:else}
						· month-level target (no category targets set)
					{/if}
				</div>
			</div>
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">Pace</div>
				{#if data.status.daysElapsed >= data.status.totalDays}
					<!-- v3.1 A08: pace is meaningless once the month is complete -->
					<div class="text-sm font-bold text-gray-500">month complete</div>
					<div class="text-[10px] text-gray-500">spend {spentPercent}% · time 100%</div>
				{:else}
					<div class="text-sm font-bold {spentPercent > pacePercent ? 'text-amber-700' : 'text-green-700'}">
						{spentPercent > pacePercent ? "over pace" : "on pace"}
					</div>
					<div class="text-[10px] text-gray-500">spend {spentPercent}% · time {pacePercent}%</div>
				{/if}
			</div>
			<div class="px-2 py-1.5">
				<div class="text-[10px] uppercase font-bold text-gray-600">{remaining >= 0 ? "Remaining" : "Over"}</div>
				<div class="text-sm font-bold {remaining >= 0 ? 'text-green-700' : 'text-red-700'}">
					{formatCurrency(Math.abs(remaining))}
				</div>
				<div class="text-[10px] text-gray-500">
					{#if remaining > 0 && data.status.totalDays > data.status.daysElapsed}
						{formatCurrency(Math.round(remaining / (data.status.totalDays - data.status.daysElapsed)))}/day for {data.status.totalDays - data.status.daysElapsed} days
					{:else if data.status.daysElapsed >= data.status.totalDays}
						final — no more days to spend
					{:else}
						projected {formatCurrency(Math.round(data.status.projectedTotal))}
					{/if}
				</div>
			</div>
		</div>
	{/if}


	<!-- v3.1 A08 design-quality: single full-width flow — verdict → progress
	     → [pace | burn-down] pair → history → config accordions. (Was a
	     grid-cols-3 whose 2/3 column held 19% content — the row-38 collapse
	     aftermath; pairing lives in the pace|chart pair, not the page.) -->
	<!-- PROGRESS BAR (always visible if budget set) -->
	{#if data.budget && data.budget.totalTargetInCents > 0}
		<div class="border border-black px-2 py-2">
			<div class="flex items-center gap-1 text-xs leading-none mb-1">
				<!-- v3.1 A08: decorative brackets removed — brackets mean ACTION in
				     this app; a status bar is not a control. Border + legend instead. -->
				<div class="flex-1 h-3 relative border border-black bg-white">
					{#if spentPercent > 100}
						<!-- #7: solid = target's share of spend, hatch = overflow -->
						<div class="h-full {progressColor}" style="width: {(100 / spentPercent) * 100}%"></div>
						<div class="h-full hatch-overflow absolute top-0" style="left: {(100 / spentPercent) * 100}%; right: 0"></div>
					{:else}
						<div class="h-full {progressColor}" style="width: {Math.min(spentPercent, 100)}%"></div>
					{/if}
				</div>
				<span class="min-w-8 font-bold {progressTextColor}">{spentPercent}%</span>
			</div>
			{#if spentPercent > 100}
				<div class="text-xs text-red-700 font-bold">
					[!] {formatCurrency(data.status.totalSpent - data.budget.totalTargetInCents)} over {formatCurrency(data.budget.totalTargetInCents)} target
				</div>
				<!-- v3.1 A08: the solid/hatched split was a guess for first-timers -->
				<div class="text-[10px] text-gray-500">solid = within target · hatched = over</div>
			{/if}
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Spent so far</span>
				<span>{formatCurrency(data.status.totalSpent)} <span class="text-gray-500">of</span> {formatCurrency(data.budget.totalTargetInCents)}</span>
			</div>
			<div class="flex justify-between text-xs text-gray-500">
				<span>{data.status.daysElapsed} of {data.status.totalDays} days elapsed</span>
				<span>{Math.round((data.status.daysElapsed / data.status.totalDays) * 100)}% of month</span>
			</div>
		</div>
	{/if}

	<!-- SPENDING SUMMARY (when no budget) -->
	{#if !data.budget}
		<div class="border border-black px-2 py-2">
			<div class="flex justify-between font-bold">
				<span>THIS MONTH</span>
				<span>{formatCurrency(data.status.totalSpent)}</span>
			</div>
			<div class="flex justify-between text-xs text-gray-500">
				<span>{data.status.daysElapsed} of {data.status.totalDays} days elapsed</span>
				<span>Avg {formatCurrency(Math.round(data.status.avgPerDay))}/day</span>
			</div>
			<div class="text-xs text-gray-500 mt-1">Spending = withdrawals + card charges − refunds. Transfers and debt payments are excluded.</div>
		</div>
	{/if}

	<!-- v3.1 A08 design-quality: pace facts + burn-down as an honest
	     same-height pair (was: everything crammed in a 1/3 column beside
	     a 19%-filled 2/3 column — the row-38 collapse aftermath) -->
	<div class="grid lg:grid-cols-2 border-b border-black">
		<!-- v3.1 A08 craft: the pace cell is a bordered panel so its bottom
		     rule stretches with the grid row — flush with the chart panel
		     (was an unbordered void below the facts) -->
		<div class="border-l border-t lg:border-r border-black flex flex-col">
	<!-- SPENDING PACE -->
	{#if data.budget && data.budget.totalTargetInCents > 0}
		<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-t border-black">SPENDING PACE <span class="{statusLabel.class}">{statusLabel.text}</span></div>
		<div class="px-2 py-2 border-b border-gray-300 flex-1">
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Avg/day</span>
				<span>{formatCurrency(Math.round(data.status.avgPerDay))}</span>
			</div>
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Projected total</span>
				<span class="{spentPercent > 100 ? 'text-red-700' : ''}">{formatCurrency(Math.round(data.status.projectedTotal))}</span>
			</div>
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Days left</span>
				<span>{Math.max(0, data.status.totalDays - data.status.daysElapsed)} of {data.status.totalDays}</span>
			</div>
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Allowance/day left</span>
				<span class="{data.budget.totalTargetInCents - data.status.totalSpent < 0 ? 'text-red-700 font-bold' : ''}">
					{formatCurrency(Math.round((data.budget.totalTargetInCents - data.status.totalSpent) / Math.max(1, data.status.totalDays - data.status.daysElapsed)))}
				</span>
			</div>
			<div class="flex justify-between text-xs">
				<span class="text-gray-500">Target</span>
				<span>{formatCurrency(data.budget.totalTargetInCents)}</span>
			</div>
			<div class="mt-2">
				<div class="flex h-1.5 border border-gray-300 relative">
					<div class="h-full bg-black" style="width: {Math.min(spentPercent, 100)}%"></div>
					<div class="absolute -top-0.5 -bottom-0.5 w-0.5 bg-green-700" style="left: {pacePercent}%"></div>
				</div>
				<div class="text-xs text-gray-500 mt-1">
					Spending {spentPercent}% | Time {pacePercent}% — <span class="{statusLabel.class}">{statusLabel.text}</span>
				</div>
			</div>
		</div>
	{/if}

		</div>
		<div>
	<!-- Phase 4 V1 #2: burn-down chart (spend curve vs even pace, today marker) -->
	{#if data.budget && data.budget.totalTargetInCents > 0}
		<div class="px-2 py-2 border-b border-gray-300">
			<BurnDownChart
				points={data.burnDown}
				totalDays={data.status.totalDays}
				targetPence={data.budget.totalTargetInCents}
				todayDay={data.isCurrentMonth ? data.status.daysElapsed : data.status.totalDays}
				spendLabel={(pence) => formatCurrency(pence)}
			/>
		</div>
	{/if}

		</div>
	</div>
	<!-- HISTORY -->
	<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-t border-black">HISTORY <span class="text-gray-500">{data.history.months.length} months</span></div>
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
							<td class="p-0.5"><a href="/overview/trends/{h.month}" class="bracket-link">{getMonthLabel(h.month)}</a></td>
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
			<div class="text-xs text-gray-500 py-1">No history yet.</div>
		{/if}
	</div>
		</div>
