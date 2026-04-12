<script lang="ts">
	import { enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import { formatCurrency } from "$lib/utils/currency";
	import PaginationClient from "$lib/components/PaginationClient.svelte";
	import type { PageData, ActionData } from "./$types";

	let { data }: { data: PageData; form: ActionData } = $props();

	// Accordion state
	let targetOpen = $state(!data.budget); // Auto-open if no budget
	let filtersOpen = $state(false);

	// Editing state for category targets
	let editingCategoryId = $state<number | null>(null);
	let editAmount = $state("");

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

	function getCatProgress(spent: number, target: number): { width: number; color: string } {
		const pct = target > 0 ? Math.min(Math.round((spent / target) * 100), 100) : 0;
		const color = pct > 100 ? "bg-red-700" : pct > 75 ? "bg-amber-600" : "bg-green-700";
		return { width: pct, color };
	}

	function startEdit(categoryId: number, currentTarget: number | null) {
		editingCategoryId = categoryId;
		editAmount = currentTarget ? (currentTarget / 100).toFixed(2) : "";
	}

	function cancelEdit() {
		editingCategoryId = null;
		editAmount = "";
	}
</script>

<div class="border-t border-black">
	<!-- Month navigation -->
	<div class="text-center py-1.5 border-b border-black bg-white">
		<div class="flex items-center justify-center gap-4">
			<a href="/overview/budgets/{getPrevMonth(data.selectedMonth)}" class="bracket-link text-xs">Prev</a>
			<span class="font-bold">{getMonthLabel(data.selectedMonth)}</span>
			{#if getNextMonth(data.selectedMonth)}
				<a href="/overview/budgets/{getNextMonth(data.selectedMonth)}" class="bracket-link text-xs">Next</a>
			{:else}
				<span class="text-xs text-gray-400">[Next]</span>
			{/if}
		</div>
		{#if !data.isCurrentMonth}
			<div class="text-gray-400 text-xs mt-0.5">Historical — read-only</div>
		{/if}
	</div>

	<!-- TARGET ACCORDION -->
	<button
		class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1.5 text-sm bg-white border-b border-black"
		onclick={() => (targetOpen = !targetOpen)}
	>
		<span class="flex items-center gap-2">
			MONTHLY TARGET
			{#if data.budget}
				<span class="{remaining >= 0 ? 'text-green-700' : 'text-red-700'} font-bold text-xs">
					{remaining >= 0 ? formatCurrency(remaining) + ' remaining' : formatCurrency(Math.abs(remaining)) + ' over'}
				</span>
			{:else}
				<span class="text-gray-400 text-xs">not set</span>
			{/if}
		</span>
		<span class="text-xs text-gray-400">{targetOpen ? '[-]' : '[+]'}</span>
	</button>

	{#if targetOpen}
		<div class="border-b border-black px-2 py-2">
			{#if data.isCurrentMonth && data.budget}
				<div class="text-sm text-gray-500 mb-1">
					Total (sum of category targets): <span class="font-bold text-black">{formatCurrency(data.budget.totalTargetInCents)}</span>
				</div>
				<div class="text-xs text-gray-400">Set individual category targets below to adjust.</div>
			{:else if data.isCurrentMonth && !data.budget}
				<form method="POST" action="?/saveTarget" use:enhance>
					<div class="flex items-center gap-2 text-sm">
						<span class="text-xs">Target</span>
						<span>£</span>
						<input name="amount" type="text" class="border border-black p-1 w-28 font-terminal text-sm" placeholder="0.00" />
						<button type="submit" class="bracket-link text-xs">Save</button>
					</div>
					<div class="text-xs text-gray-400 mt-1">Set a monthly spending target to unlock progress tracking.</div>
				</form>
			{:else}
				<div class="text-sm text-gray-500">
					Target: <span class="font-bold text-black">{data.budget ? formatCurrency(data.budget.totalTargetInCents) : 'Not set'}</span>
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
					<div class="h-full {progressColor}" style="width: {Math.min(spentPercent, 100)}%"></div>
				</div>
				<span>]</span>
				<span class="min-w-8 font-bold {progressTextColor}">{spentPercent}%</span>
			</div>
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

	<!-- CATEGORY TARGETS -->
	<div class="font-bold text-xs px-2 py-1 bg-gray-50 border-t border-black">CATEGORY TARGETS <span class="text-gray-400">{targetedCategories.length} targeted · {untargetedCategories.length} untargeted</span></div>
	<div class="px-2 py-1 border-b border-gray-300">
		{#if targetedCategories.length > 0}
			<div class="text-gray-500 font-bold text-xs py-1">WITH TARGETS</div>
			{#each targetedCategories as cat (cat.id)}
				{@const prog = getCatProgress(cat.spent, cat.target ?? 0)}
				{@const pct = cat.target && cat.target > 0 ? Math.round((cat.spent / cat.target) * 100) : 0}

				{#if editingCategoryId === cat.id && data.isCurrentMonth}
					<!-- Inline edit mode -->
					<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200 bg-yellow-50 px-1">
						<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
						<span class="text-xs w-20 shrink-0">{cat.name}</span>
						<form method="POST" action="?/saveCategoryTarget" use:enhance>
							<input type="hidden" name="categoryId" value={cat.id} />
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
						<span class="text-xs w-20 shrink-0">{cat.name}</span>
						<div class="flex items-center gap-0.5 text-xs min-w-[120px]">
							<span>[</span>
							<div class="flex-1 h-2 relative border-y border-gray-100">
								<div class="h-full {prog.color}" style="width: {prog.width}%"></div>
							</div>
							<span>]</span>
							<span class="min-w-6 font-bold {pct > 100 ? 'text-red-700' : pct > 75 ? 'text-amber-600' : 'text-green-700'}">{pct}%</span>
						</div>
						<span class="text-xs min-w-[70px] text-right">
							{formatCurrency(cat.spent)} <span class="text-gray-400">/</span> {formatCurrency(cat.target ?? 0)}
						</span>
						{#if data.isCurrentMonth}
							<button class="bracket-link text-xs" onclick={() => startEdit(cat.id, cat.target)}>Edit</button>
						{/if}
					</div>
				{/if}
			{/each}
		{/if}

		{#if untargetedCategories.length > 0}
			<div class="text-gray-500 font-bold text-xs py-1 {targetedCategories.length > 0 ? 'mt-1' : ''}">WITHOUT TARGETS</div>
			{#each untargetedCategories as cat (cat.id)}
				<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200">
					<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
					<span class="text-xs w-20 shrink-0">{cat.name}</span>
					<span class="text-xs text-gray-400 min-w-[70px] text-right">{formatCurrency(cat.spent)} spent</span>
					{#if data.isCurrentMonth}
						<button class="bracket-link text-xs" onclick={() => startEdit(cat.id, null)}>Set Target</button>
					{/if}
				</div>
			{/each}
		{/if}

		{#if editingCategoryId && !targetedCategories.find(c => c.id === editingCategoryId) && !untargetedCategories.find(c => c.id === editingCategoryId)}
			{@const cat = data.categories.find(c => c.id === editingCategoryId)}
			{#if cat}
				<div class="flex items-center gap-2 py-1 border-b border-dotted border-gray-200 bg-yellow-50 px-1">
					<span class="w-2 h-2 shrink-0" style="background: {cat.colour}"></span>
					<span class="text-xs w-20 shrink-0">{cat.name}</span>
					<form method="POST" action="?/saveCategoryTarget" use:enhance>
						<input type="hidden" name="categoryId" value={cat.id} />
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

	<!-- FILTERS ACCORDION -->
	{#if data.budget}
		<button
			class="w-full font-bold flex justify-between items-center cursor-pointer px-2 py-1 text-xs bg-gray-50 border-t border-black border-b border-gray-300"
			onclick={() => (filtersOpen = !filtersOpen)}
		>
			<span>FILTERS <span class="text-gray-400">{data.budget.excludedCategoryIds.length > 0 ? (data.categories.length - data.budget.excludedCategoryIds.length) + '/' + data.categories.length + ' cats' : 'all cats'} · {data.budget.excludedAccountIds.length > 0 ? (data.accounts.length - data.budget.excludedAccountIds.length) + '/' + data.accounts.length + ' accts' : 'all accts'}</span></span>
			<span class="text-xs text-gray-400">{filtersOpen ? '[-]' : '[+]'}</span>
		</button>
		{#if filtersOpen}
			<div class="px-2 py-1 border-b border-gray-300">
				{#if data.isCurrentMonth}
					<div class="text-gray-500 font-bold text-xs py-1">CATEGORIES</div>
					{#each data.categories as cat (cat.id)}
						{@const excluded = data.budget.excludedCategoryIds.includes(cat.id)}
						<form method="POST" action="?/toggleCategory" use:enhance class="inline">
							<input type="hidden" name="categoryId" value={cat.id} />
							<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
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
						<form method="POST" action="?/toggleAccount" use:enhance class="inline">
							<input type="hidden" name="accountId" value={acc.id} />
							<input type="hidden" name="included" value={excluded ? 'true' : 'false'} />
							<button type="submit" class="flex items-center gap-1.5 py-0.5 cursor-pointer w-full text-left {excluded ? 'opacity-40' : 'hover:bg-gray-50'}">
								<span class="font-bold text-xs">{excluded ? '[ ]' : '[X]'}</span>
								<span class="text-xs {excluded ? 'line-through' : ''}">{acc.name}</span>
								<span class="text-xs text-gray-400">{acc.type}</span>
							</button>
						</form>
					{/each}

					<div class="text-xs text-gray-400 mt-2 border-t border-dotted border-gray-200 pt-1">
						Transactions without a category are included by default.
					</div>
				{:else}
					<div class="text-xs text-gray-400">Filters are read-only for historical months.</div>
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
				page={data.history.pagination.page}
				totalPages={data.history.pagination.totalPages}
				onPageChange={async (newPage) => {
					const url = new URL(window.location.href);
					if (newPage > 0) {
						url.searchParams.set('page', String(newPage + 1));
					} else {
						url.searchParams.delete('page');
					}
					history.pushState({}, '', url);
					await invalidateAll();
				}}
				scrollTarget={historyRef}
			/>
		{:else}
			<div class="text-xs text-gray-400 py-1">No history yet.</div>
		{/if}
	</div>

	<!-- FOOTER -->
	<div class="flex justify-between items-center px-2 py-2 bg-gray-50 border-t border-black text-xs">
		<span class="text-gray-400">
			{#if data.budget}
				{data.budget.excludedCategoryIds.length > 0 ? (data.categories.length - data.budget.excludedCategoryIds.length) + ' of ' + data.categories.length + ' categories' : 'All categories'}
				·
				{data.budget.excludedAccountIds.length > 0 ? (data.accounts.length - data.budget.excludedAccountIds.length) + ' of ' + data.accounts.length + ' accounts' : 'All accounts'}
			{:else}
				No filters applied
			{/if}
		</span>
		<button class="bracket-link" onclick={() => { targetOpen = !targetOpen; filtersOpen = !filtersOpen; }}>
			{targetOpen || filtersOpen ? 'Collapse All' : 'Expand All'}
		</button>
	</div>
</div>
