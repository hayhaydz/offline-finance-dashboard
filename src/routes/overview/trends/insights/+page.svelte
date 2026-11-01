<script lang="ts">
	import TrendsMonthCompare from '$lib/components/charts/TrendsMonthCompare.svelte';
	import BalanceMonthChart from '$lib/components/charts/BalanceMonthChart.svelte';
	import TargetPaceChart from '$lib/components/charts/TargetPaceChart.svelte';
	import HistoryTrendChart from '$lib/components/HistoryTrendChart.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import { formatCurrency, formatCurrencyShorthand } from '$lib/utils/currency';
	import { savedOrLostPence } from '$lib/utils/trends-math';

	/**
	 * Spending insights (v3.2 A14 / V6) — Monzo's balance / spending /
	 * target tabs rebuilt in the SITE'S grammar (2026-11-01 redesign after
	 * user steer): goals-style filter band (bracket-link tabs, active
	 * text-green-800), KpiCard strips, boxed tables with gray-100 band
	 * headers, ChartPanels. No default HTML control styling anywhere.
	 * Statement-model honest (D0): months are DECLARED statement months;
	 * estimates come from declared-history averages, never realtime.
	 */
	let { data } = $props();

	type TabId = 'balance' | 'spending' | 'target';
	let tab: TabId = $state('balance');
	let scope = $state<'month' | 'year'>('month');
	let outOpen = $state(false);
	// target tab: category wall cap (top movers only until [+])
	let catsOpen = $state(false);
	const TARGET_CATEGORY_CAP = 6;

	const TABS: Array<{ id: TabId; label: string }> = [
		{ id: 'balance', label: 'balance' },
		{ id: 'spending', label: 'spending' },
		{ id: 'target', label: 'target' },
	];

	const monthLabel = (key: string) => {
		const [y, m] = key.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC',
		});
	};

	const chosenFlow = $derived(
		data.balanceFlows.find((f) => f.monthKey === data.monthKey) ?? null,
	);
	const yearFlows = $derived(
		data.balanceFlows.filter((f) => f.monthKey.startsWith(data.monthKey.slice(0, 4))),
	);
	const isYear = $derived(scope === 'year');
	const windowFlows = $derived(isYear ? yearFlows : chosenFlow ? [chosenFlow] : []);
	const windowIn = $derived(windowFlows.reduce((s, f) => s + f.moneyInPence, 0));
	const windowOut = $derived(windowFlows.reduce((s, f) => s + f.moneyOutPence, 0));
	const windowStart = $derived(data.startingBalancePence);
	const windowEnd = $derived(
		windowFlows.length ? windowFlows[windowFlows.length - 1].closingBalancePence : data.startingBalancePence,
	);

	const lastMonthTotal = $derived(
		cumulativeTotal(data.previousMonthDailies),
	);
	function historyStatus(target: number, actual: number): { label: string; cls: string } {
		if (target === 0) return { label: '—', cls: 'text-gray-500' };
		const pct = Math.round((actual / target) * 100);
		if (pct > 100) return { label: `OVER +${pct - 100}%`, cls: 'text-red-700 font-bold' };
		if (pct >= 95) return { label: `UNDER -${100 - pct}%`, cls: 'text-amber-700 font-bold' };
		return { label: `UNDER -${100 - pct}%`, cls: 'text-green-700 font-bold' };
	}

	// moneyOut-only (matches trends-math conventions + the chart summary);
	// flipping EVERY amount silently netted refunds against spend — the KPI
	// and the chart disagreed by exactly the month's positive dailies
	// (vision-caught £9,847.54 vs £9,882, 2026-11-01)
	function cumulativeTotal(dailies: Array<{ day: number; amountPence: number }>): number {
		return dailies.reduce((s, d) => s + (d.amountPence < 0 ? -d.amountPence : 0), 0);
	}

	const saved = $derived(savedOrLostPence(data.targetPence, data.spentPence));

	// spending tab year view (V6 spec: "radio option for year here as well")
	const yearOutTotal = $derived(yearFlows.reduce((s2, f) => s2 + f.moneyOutPence, 0));
	const busiest = $derived(
		yearFlows.reduce<null | (typeof yearFlows)[number]>((b, f) => (!b || f.moneyOutPence > b.moneyOutPence ? f : b), null),
	);
	const quietest = $derived(
		yearFlows.reduce<null | (typeof yearFlows)[number]>((q, f) => (!q || f.moneyOutPence < q.moneyOutPence ? f : q), null),
	);

	function switchTab(id: TabId) {
		tab = id;
		outOpen = false;
		catsOpen = false;
	}
</script>

<div class="p-2 flex flex-col gap-2">
	<!-- page header: the reports/tools pattern — h1 + meta line, no box -->
	<div class="flex justify-between items-baseline">
		<h1 class="text-lg font-bold m-0">Spending insights</h1>
		<div class="flex items-center gap-2 text-xs">
			<a href="/overview/trends/insights?month={data.previousKey}" class="bracket-link" data-sveltekit-noscroll>◀ {monthLabel(data.previousKey)}</a>
			<span class="font-bold">{monthLabel(data.monthKey)}</span>
			{#if data.monthKey < data.currentMonthKey}
				<a href="/overview/trends/insights" class="bracket-link" data-sveltekit-noscroll>latest ▶</a>
			{/if}
			<a href="/overview/trends/{data.monthKey}/config" class="bracket-link font-bold">Config & amendments</a>
		</div>
	</div>
	<p class="text-xs text-gray-600 m-0">
		{#if data.chosenMonthDeclared}
			{data.monthKey} as declared from statements
		{:else}
			{data.monthKey} not declared yet — it enters at statement time
		{/if}
		· not realtime · {isYear ? 'year view shows declared months only' : 'estimates from declared-history averages'}
	</p>

	<!-- tab band: the goals filter grammar (bracket links, active green) -->
	<div class="font-bold flex justify-between items-center bg-gray-100 border-y border-black p-2">
		<div role="tablist" aria-label="Insights view" class="flex gap-2 font-normal">
			{#each TABS as t (t.id)}
				<button
					type="button"
					role="tab"
					id="{t.id}-tab"
					aria-selected={tab === t.id}
					aria-controls="{t.id}-panel"
					class="bracket-link text-xs font-bold cursor-pointer"
					class:text-green-800={tab === t.id}
					onclick={() => switchTab(t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>
		{#if tab !== 'target'}
		<div class="flex gap-2">
			<button
				type="button"
				class="bracket-link text-xs font-bold cursor-pointer"
				class:text-green-800={scope === 'month'}
				aria-pressed={scope === 'month'}
				onclick={() => (scope = 'month')}
			>
				month
			</button>
			<button
				type="button"
				class="bracket-link text-xs font-bold cursor-pointer"
				class:text-green-800={scope === 'year'}
				aria-pressed={scope === 'year'}
				onclick={() => (scope = 'year')}
			>
				year
			</button>
		</div>
		{/if}
	</div>

	<!-- ═══ BALANCE ═══ -->
	{#if tab === 'balance'}
		<!-- .contents: tabpanel exists for ARIA only — children lay out as
		     direct children of the page column (zero layout change) -->
		<div role="tabpanel" id="balance-panel" aria-labelledby="balance-tab" class="contents">
		<!-- KPI strip: the site's KpiCard grid -->
		<div class="border border-black grid grid-cols-4 [&>*:last-child]:border-r-0">
			<KpiCard label="Starting balance" value={formatCurrency(windowStart)} />
			<KpiCard label="Money in" value={`+${formatCurrency(windowIn)}`} color="text-green-700" detail={windowFlows.length ? `${windowFlows.length} declared month${windowFlows.length === 1 ? '' : 's'}` : 'none declared'} />
			<KpiCard label="Money out" value={`−${formatCurrency(windowOut)}`} color="text-red-700" />
			<KpiCard label="Ending balance" value={formatCurrency(windowEnd)} />
		</div>

		{#if data.estimatedEndPence !== null && !isYear}
			<div class="border border-black bg-amber-50 px-2 py-1.5 text-sm flex justify-between items-baseline">
				<span>
					<span class="font-bold">Estimated month-end</span>
					<span class="text-[10px] text-gray-600">
						— declared-history averages{data.avgInPence !== null && data.avgOutPence !== null ? ` (in ${formatCurrency(data.avgInPence)} · out ${formatCurrency(data.avgOutPence)}/mo)` : ''}
					</span>
				</span>
				<span class="tabular-nums font-bold">{formatCurrency(data.estimatedEndPence)}</span>
			</div>
		{/if}

		{#if isYear}
			{#if yearFlows.length > 1}
				<HistoryTrendChart
					points={yearFlows.map((f) => ({
						month: f.monthKey,
						amountInCents: f.closingBalancePence,
					}))}
					formatAmount={(p) => formatCurrencyShorthand(p)}
					yearStartMonth={1}
					height={200}
				/>
			{:else}
				<div class="border border-black p-2 text-xs text-gray-600">
					Not enough declared history for the year graph yet — months appear as statements are entered.
				</div>
			{/if}
		{:else if data.balanceDailies.length > 0}
			<!-- v3.2 fix (2026-11-01 user report): month scope = THIS month,
			     day 1 -> last, running balance — never the multi-month series -->
			<BalanceMonthChart
				monthKey={data.monthKey}
				dailies={data.balanceDailies}
				daysInMonth={data.daysInMonth}
			/>
		{:else}
			<div class="border border-black p-2 text-xs text-gray-600">
				{data.monthKey} has no declared transactions yet — the balance line appears at statement time.
			</div>
		{/if}

		<!-- ledger: boxed table with band header + expandable category rows -->
		<div class="border border-black">
			<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
				<span>MONEY MOVEMENT · {isYear ? data.monthKey.slice(0, 4) : data.monthKey}</span>
				{#if data.categories.included.length}
					<!-- plain [+] expander (accordion grammar) — bracket-link
					     would double-wrap the brackets -->
					<button type="button" class="text-xs text-gray-700 cursor-pointer font-normal" onclick={() => (outOpen = !outOpen)} aria-expanded={outOpen}>
						{outOpen ? '[-] hide categories' : '[+] by category'}
					</button>
				{/if}
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-black">
							<th class="pl-2 text-left text-xs py-1">Line</th>
							<th class="text-right pr-2 text-xs py-1 w-40">Amount</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-gray-200"><td class="pl-2 text-sm py-1.5">Starting balance</td><td class="text-right pr-2 text-sm py-1.5 tabular-nums font-bold">{formatCurrency(windowStart)}</td></tr>
						<tr class="border-b border-gray-200"><td class="pl-2 text-sm py-1.5">Money in (income + deposits)</td><td class="text-right pr-2 text-sm py-1.5 tabular-nums text-green-700">+{formatCurrency(windowIn)}</td></tr>
						<tr class="border-b border-gray-200"><td class="pl-2 text-sm py-1.5">Money out (spend)</td><td class="text-right pr-2 text-sm py-1.5 tabular-nums text-red-700">−{formatCurrency(windowOut)}</td></tr>
						<tr class="bg-gray-50"><td class="pl-2 text-sm py-1.5 font-bold">Ending balance</td><td class="text-right pr-2 text-sm py-1.5 tabular-nums font-bold">{formatCurrency(windowEnd)}</td></tr>
						{#if outOpen}
							{#if data.categories.included.length}
								<tr class="border-b border-black bg-gray-50"><td colspan="2" class="pl-2 py-1 text-[10px] font-bold uppercase text-gray-600">Spend by category</td></tr>
								{#each data.categories.included as cat (cat.name)}
									<tr class="border-b border-gray-100">
										<td class="pl-4 text-xs py-1 text-gray-700">└ {cat.name}</td>
										<td class="text-right pr-2 text-xs py-1 tabular-nums text-gray-700">{formatCurrency(cat.spentPence)}</td>
									</tr>
								{/each}
							{:else}
								<tr class="border-b border-gray-100"><td colspan="2" class="pl-2 py-1.5 text-xs text-gray-500">No categorised spend declared this month.</td></tr>
							{/if}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
		</div>
	{/if}

	<!-- ═══ SPENDING ═══ -->
	{#if tab === 'spending'}
		<div role="tabpanel" id="spending-panel" aria-labelledby="spending-tab" class="contents">
		{#if isYear}
		<div class="border border-black grid grid-cols-4 [&>*:last-child]:border-r-0">
			<KpiCard label="Spent · year" value={formatCurrency(yearOutTotal)} detail={`${data.monthKey.slice(0, 4)} · declared months only`} />
			<KpiCard label="Months declared" value={String(yearFlows.length)} detail="statements entered so far" />
			<KpiCard label="Heaviest month" value={busiest ? formatCurrency(busiest.moneyOutPence) : '—'} detail={busiest ? monthLabel(busiest.monthKey) : 'no data'} color="text-red-700" />
			<KpiCard label="Quietest month" value={quietest ? formatCurrency(quietest.moneyOutPence) : '—'} detail={quietest ? monthLabel(quietest.monthKey) : 'no data'} color="text-green-700" />
		</div>

		{#if yearFlows.length > 1}
			<HistoryTrendChart
				points={yearFlows.map((f) => ({ month: f.monthKey, amountInCents: f.moneyOutPence }))}
				formatAmount={formatCurrencyShorthand}
				yearStartMonth={1}
				height={200}
			/>
		{:else}
			<div class="border border-black p-2 text-xs text-gray-600">
				Not enough declared history for the year graph yet — months appear as statements are entered.
			</div>
		{/if}
		{:else}
		<div class="border border-black grid grid-cols-4 [&>*:last-child]:border-r-0">
			<KpiCard label="Spent · chosen month" value={formatCurrency(data.chosenMonthTotalPence)} detail={data.monthKey} />
			<KpiCard label="Same span · previous" value={formatCurrency(lastMonthTotal)} detail={data.previousKey} />
			<KpiCard
				label="Month vs month"
				value={`${data.chosenMonthTotalPence - lastMonthTotal >= 0 ? '+' : '−'}${formatCurrency(Math.abs(data.chosenMonthTotalPence - lastMonthTotal))}`}
				color={data.chosenMonthTotalPence - lastMonthTotal > 0 ? 'text-red-700' : 'text-green-700'}
				detail="negative = spending less than last month"
			/>
			<KpiCard label="Accounts in view" value={String(data.accountCount)} detail="all accounts" />
		</div>

		<TrendsMonthCompare
			currentMonthKey={data.monthKey}
			previousMonthKey={data.previousKey}
			currentDaily={data.chosenMonthDailies}
			previousDaily={data.previousMonthDailies}
			title="Month vs previous month"
		/>
		{/if}

		<div class="grid grid-cols-5 gap-2">
			<div class="col-span-3 border border-black [&>*:last-child]:border-b-0">
				<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">SPENDING BY CATEGORY{#if isYear} <span class="text-[10px] font-normal text-gray-600">· {data.monthKey} (monthly detail — enter each month to build the year)</span>{/if}</div>
				<table class="w-full">
					<tbody>
						{#each data.categories.included as cat (cat.name)}
							<tr class="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
								<td class="pl-2 text-sm py-1.5">{cat.name}</td>
								<td class="text-right pr-2 text-sm py-1.5 tabular-nums">{formatCurrency(cat.spentPence)}</td>
							</tr>
						{:else}
							<tr><td class="px-2 py-1.5 text-xs text-gray-500">No categorised spend declared.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="col-span-2 border border-black [&>*:last-child]:border-b-0">
				<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">EXCLUDED CATEGORIES</div>
				<table class="w-full">
					<tbody>
						{#each data.categories.excluded as cat (cat.name)}
							<tr class="border-b border-gray-200">
								<td class="pl-2 text-sm py-1.5">{cat.name}</td>
								<td class="text-right pr-2 text-sm py-1.5 tabular-nums text-gray-600">{formatCurrency(cat.spentPence)}</td>
							</tr>
						{:else}
							<tr><td class="px-2 py-1.5 text-xs text-gray-500">No excluded-category spend this month.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		</div>
	{/if}

	<!-- ═══ TARGET ═══ -->
	{#if tab === 'target'}
		<div role="tabpanel" id="target-panel" aria-labelledby="target-tab" class="contents">
		<div class="border border-black grid grid-cols-4 [&>*:last-child]:border-r-0">
			<KpiCard label="Target" value={data.targetPence > 0 ? formatCurrency(data.targetPence) : '—'} detail={data.targetPence > 0 ? `${data.daysInMonth} days · even pace` : 'not set'} />
			<KpiCard label="Spent" value={formatCurrency(data.spentPence)} detail={data.chosenMonthDeclared ? 'as declared' : 'nothing declared yet'} />
			<KpiCard
				label={saved >= 0 ? 'Saved' : 'Lost'}
				value={formatCurrency(Math.abs(saved))}
				color={saved >= 0 ? 'text-green-700' : 'text-red-700'}
				detail={data.targetPence > 0 ? 'vs target' : 'set a target to track'}
			/>
			<KpiCard
				label="Verdict"
				value={data.targetPence === 0 ? '—' : saved >= 0 ? 'UNDER' : 'OVER'}
				color={saved >= 0 ? 'text-green-700' : 'text-red-700'}
				detail="spend line vs pace line"
			/>
		</div>

		{#if data.targetPence > 0}
			<p class="text-sm m-0">
				<span class="font-bold">you spent {formatCurrency(data.spentPence)} overall</span>
				— {saved >= 0 ? `saved ${formatCurrency(saved)}` : `lost ${formatCurrency(-saved)}`}
				against the {formatCurrency(data.targetPence)} target
			</p>
			<TargetPaceChart
				monthKey={data.monthKey}
				targetPence={data.targetPence}
				dailies={data.chosenMonthDailies}
				daysInMonth={data.daysInMonth}
			/>
		{:else}
			<div class="border border-black p-2 text-sm">
				No target set for {data.monthKey}. <a href="/overview/trends/{data.monthKey}/config" class="bracket-link">Set a monthly target →</a>
			</div>
		{/if}

		<div class="grid grid-cols-5 gap-2">
			<div class="col-span-3 border border-black [&>*:last-child]:border-b-0">
				<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
					<span>BY CATEGORY</span>
					<!-- v3.2: categories don't need to always be in view (2026-10-31
					     direction) — top movers visible, the wall behind one bracket -->
					{#if data.categories.included.length > TARGET_CATEGORY_CAP}
						<button
							type="button"
							class="text-xs text-gray-700 cursor-pointer font-normal"
							onclick={() => (catsOpen = !catsOpen)}
							aria-expanded={catsOpen}
						>
							{catsOpen ? '[-] hide' : '[+] show all ' + data.categories.included.length}
						</button>
					{/if}
				</div>
				<table class="w-full">
					<tbody>
						{#each (catsOpen ? data.categories.included : data.categories.included.slice(0, TARGET_CATEGORY_CAP)) as cat (cat.name)}
							<tr class="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
								<td class="pl-2 text-sm py-1.5">{cat.name}</td>
								<td class="text-right pr-2 text-sm py-1.5 tabular-nums">{formatCurrency(cat.spentPence)}</td>
							</tr>
						{:else}
							<tr><td class="px-2 py-1.5 text-xs text-gray-500">No categorised spend declared.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="col-span-2 border border-black [&>*:last-child]:border-b-0">
				<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">EXCLUDED FROM TARGET</div>
				<table class="w-full">
					<tbody>
						{#each data.categories.excluded as cat (cat.name)}
							<tr class="border-b border-gray-200">
								<td class="pl-2 text-sm py-1.5">{cat.name}</td>
								<td class="text-right pr-2 text-sm py-1.5 tabular-nums text-gray-600">{formatCurrency(cat.spentPence)}</td>
							</tr>
						{:else}
							<tr><td class="px-2 py-1.5 text-xs text-gray-500">Nothing excluded this month.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		</div>
	{/if}

	<!-- v3.2 merge (2026-11-01 user steer): the old month page's HISTORY
	     table lives in the target tab — the closest descendant of it. -->
	{#if tab === 'target' && data.history.months.length > 0}
		<div class="border border-black">
			<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold flex justify-between items-center">
				<span>HISTORY <span class="text-xs font-normal text-gray-600">{data.history.months.length} months</span></span>
				<a href="/overview/trends/all" class="bracket-link text-xs font-normal">Full history + amendments →</a>
			</div>
			<table class="w-full">
				<thead>
					<tr class="border-b border-black">
						<th class="pl-2 py-1 text-left text-[10px] font-bold text-gray-600 uppercase">Month</th>
						<th class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Target</th>
						<th class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Actual</th>
						<th class="py-1 pr-2 text-right text-[10px] font-bold text-gray-600 uppercase">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.history.months as h (h.month)}
						{@const st = historyStatus(h.totalTarget, h.actualSpent)}
						<tr class="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-150">
							<td class="pl-2 py-1.5 text-sm"><a href="/overview/trends/insights?month={h.month}" class="bracket-link">{monthLabel(h.month)}</a></td>
							<td class="py-1.5 pr-2 text-right text-sm tabular-nums">{formatCurrency(h.totalTarget)}</td>
							<td class="py-1.5 pr-2 text-right text-sm tabular-nums">{formatCurrency(h.actualSpent)}</td>
							<td class="py-1.5 pr-2 text-right text-sm {st.cls}">{st.label}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="flex justify-between items-center text-xs">
		<a href="/overview/trends/{data.monthKey}/config" class="bracket-link">← Config &amp; amendments</a>
		<a href="/overview/trends/all" class="bracket-link">Trend history</a>
	</div>
</div>
