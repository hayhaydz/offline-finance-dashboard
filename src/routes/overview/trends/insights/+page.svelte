<script lang="ts">
	import TrendsMonthCompare from '$lib/components/charts/TrendsMonthCompare.svelte';
	import TargetPaceChart from '$lib/components/charts/TargetPaceChart.svelte';
	import HistoryTrendChart from '$lib/components/HistoryTrendChart.svelte';
	import { formatCurrency } from '$lib/utils/currency';
	import { savedOrLostPence, targetPaceByDay, cumulativeSpendByDay } from '$lib/utils/trends-math';

	/**
	 * Spending insights (v3.2 A14 / V6): Monzo's balance / spending / target
	 * tabs in the terminal grammar — custom tab buttons (never default HTML
	 * controls), boxed panels, statement-honest copy (D0).
	 */
	let { data } = $props();

	type TabId = 'balance' | 'spending' | 'target';
	let tab: TabId = $state('balance');
	// terminal segmented radios: [ ] month / [•] year semantics, button-based
	let scope = $state<'month' | 'year'>('month');
	let breakdownOpen: 'in' | 'out' | null = $state(null);

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
	const yearMonths = $derived(
		scope === 'year'
			? data.balanceFlows.filter((f) => f.monthKey.startsWith(data.monthKey.slice(0, 4)))
			: [],
	);

	const saved = $derived(savedOrLostPence(data.targetPence, data.spentPence));

	// TARGET tab: cumulative spend + diagonal pace series
	const targetRows = $derived.by(() => {
		const pace = targetPaceByDay(data.targetPence, data.daysInMonth);
		const cum = cumulativeSpendByDay(data.chosenMonthDailies, data.daysInMonth);
		return Array.from({ length: data.daysInMonth }, (_, i) => ({
			day: i + 1,
			pace: pace[i],
			spent: cum[i],
		}));
	});

	function switchTab(id: TabId) {
		tab = id;
		breakdownOpen = null;
	}
</script>

<div class="p-2 flex flex-col gap-2">
	<!-- title band: real h1 (D9) + month chooser -->
	<div class="border border-black">
		<div class="bg-gray-100 border-b border-black px-2 py-1.5 flex justify-between items-center">
			<h1 class="text-lg font-bold m-0 uppercase">Spending insights</h1>
			<div class="flex items-center gap-2 text-xs">
				<a href="/overview/trends/{data.previousKey}/insights" class="bracket-link" data-sveltekit-noscroll>◀ {monthLabel(data.previousKey)}</a>
				<span class="font-bold">{monthLabel(data.monthKey)}</span>
				{#if data.monthKey < data.currentMonthKey}
					<a href="/overview/trends/insights" class="bracket-link" data-sveltekit-noscroll>latest ▶</a>
				{/if}
			</div>
		</div>
		<!-- terminal tab bar (custom buttons; no default HTML control styling) -->
		<div class="flex border-b border-black" role="tablist" aria-label="Insight views">
			{#each TABS as t (t.id)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === t.id}
					class="px-3 py-1.5 text-sm cursor-pointer border-r border-black last:border-r-0 transition-colors duration-150
						{tab === t.id ? 'bg-white font-bold underline underline-offset-4' : 'bg-gray-100 text-gray-600 hover:bg-gray-50'}"
					onclick={() => switchTab(t.id)}
				>
					{t.label}
				</button>
			{/each}
			<!-- scope segmented radio: month/year (statement-honest: year = declared months only) -->
			<div class="ml-auto flex items-center gap-1 px-2 text-xs" role="radiogroup" aria-label="Scope">
				<button
					type="button"
					role="radio"
					aria-checked={scope === 'month'}
					class="bracket-link cursor-pointer {scope === 'month' ? 'font-bold text-green-800' : 'text-gray-600'}"
					onclick={() => (scope = 'month')}
				>[•] month</button>
				<button
					type="button"
					role="radio"
					aria-checked={scope === 'year'}
					class="bracket-link cursor-pointer {scope === 'year' ? 'font-bold text-green-800' : 'text-gray-600'}"
					onclick={() => (scope = 'year')}
				>[•] year</button>
			</div>
		</div>

		<!-- ═══ BALANCE ═══ -->
		{#if tab === 'balance'}
			<div class="p-2 flex flex-col gap-2">
				<p class="text-[10px] text-gray-600 m-0">
					statement model — {scope === 'year' ? `${data.monthKey.slice(0, 4)} shows declared months only` : `${data.monthKey} as declared`}; estimates come from declared-history averages, never realtime
				</p>
				{#if data.balanceFlows.length > 1}
					<HistoryTrendChart
						points={(scope === 'year' ? yearMonths : data.balanceFlows).map((f) => ({
							month: f.monthKey,
							amountInCents: f.closingBalancePence,
						}))}
						formatAmount={formatCurrency}
						yearStartMonth={1}
					/>
				{:else}
					<div class="border border-dashed border-gray-200 p-2 text-xs text-gray-600">
						Not enough declared history for the balance graph yet — months appear as statements are entered.
					</div>
				{/if}
				<!-- ledger: start → in/out (expandable) → end -->
				<div class="border border-black text-sm">
					<div class="flex justify-between px-2 py-1.5 border-b border-gray-200">
						<span>Starting balance</span>
						<span class="tabular-nums font-bold">{formatCurrency(data.startingBalancePence)}</span>
					</div>
					<div class="border-b border-gray-200">
						<button type="button" class="w-full flex justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-50 text-left" onclick={() => (breakdownOpen = breakdownOpen === 'in' ? null : 'in')} aria-expanded={breakdownOpen === 'in'}>
							<span>Total money in <span class="text-xs text-gray-500">{chosenFlow ? '· income + deposits' : '· none declared'}</span></span>
							<span class="tabular-nums font-bold text-green-700">+{formatCurrency(chosenFlow?.moneyInPence ?? 0)}</span>
						</button>
						{#if breakdownOpen === 'in' && data.categories.included.length}
							<div class="px-4 pb-1.5 text-xs text-gray-600 border-t border-gray-100">
								categories carry spend only — money-in detail lands with per-type breakdowns (statement model)
							</div>
						{/if}
					</div>
					<div class="border-b border-gray-200">
						<button type="button" class="w-full flex justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-50 text-left" onclick={() => (breakdownOpen = breakdownOpen === 'out' ? null : 'out')} aria-expanded={breakdownOpen === 'out'}>
							<span>Total money out <span class="text-xs text-gray-500">▾ by category</span></span>
							<span class="tabular-nums font-bold text-red-700">−{formatCurrency(chosenFlow?.moneyOutPence ?? 0)}</span>
						</button>
						{#if breakdownOpen === 'out'}
							<div class="border-t border-gray-100">
								{#each data.categories.included as cat (cat.name)}
									<div class="flex justify-between px-4 py-1 text-xs border-b border-gray-100 last:border-b-0">
										<span>{cat.name}</span>
										<span class="tabular-nums">{formatCurrency(cat.spentPence)}</span>
									</div>
								{:else}
									<div class="px-4 py-1 text-xs text-gray-500">No categorised spend declared this month.</div>
								{/each}
							</div>
						{/if}
					</div>
					<div class="flex justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
						<span class="font-bold">Ending balance</span>
						<span class="tabular-nums font-bold">{formatCurrency(chosenFlow?.closingBalancePence ?? data.startingBalancePence)}</span>
					</div>
					{#if data.estimatedEndPence !== null}
						<div class="flex justify-between px-2 py-1.5 bg-amber-50">
							<span>Estimated month-end <span class="text-[10px] text-gray-600">— from declared-history averages{data.avgInPence !== null && data.avgOutPence !== null ? ` (in ${formatCurrency(data.avgInPence)} · out ${formatCurrency(data.avgOutPence)}/mo)` : ''}</span></span>
							<span class="tabular-nums font-bold">{formatCurrency(data.estimatedEndPence)}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ═══ SPENDING ═══ -->
		{#if tab === 'spending'}
			<div class="p-2 flex flex-col gap-2">
				<p class="text-[10px] text-gray-600 m-0">
					{data.monthKey} vs {data.previousKey} · {data.chosenMonthDeclared ? `${formatCurrency(data.chosenMonthTotalPence)} spent as declared` : 'not declared yet — enters at statement time'} · not realtime
				</p>
				<TrendsMonthCompare
					currentMonthKey={data.monthKey}
					previousMonthKey={data.previousKey}
					currentDaily={data.chosenMonthDailies}
					previousDaily={data.previousMonthDailies}
					title="Spending"
				/>
				<div class="grid grid-cols-2 gap-2">
					<div class="border border-black">
						<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">SPENDING BY CATEGORY</div>
						{#each data.categories.included as cat (cat.name)}
							<div class="flex justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0">
								<span>{cat.name}</span>
								<span class="tabular-nums">{formatCurrency(cat.spentPence)}</span>
							</div>
						{:else}
							<div class="px-2 py-1.5 text-xs text-gray-500">No categorised spend declared.</div>
						{/each}
					</div>
					<div class="border border-black">
						<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">EXCLUDED CATEGORIES</div>
						{#each data.categories.excluded as cat (cat.name)}
							<div class="flex justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0">
								<span>{cat.name}</span>
								<span class="tabular-nums text-gray-600">{formatCurrency(cat.spentPence)}</span>
							</div>
						{:else}
							<div class="px-2 py-1.5 text-xs text-gray-500">No excluded-category spend this month.</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- ═══ TARGET ═══ -->
		{#if tab === 'target'}
			<div class="p-2 flex flex-col gap-2">
				<p class="text-sm m-0">
					<span class="font-bold">you spent {formatCurrency(data.spentPence)} overall</span>
					{#if data.targetPence > 0}
						— {saved >= 0
							? `saved ${formatCurrency(saved)}`
							: `lost ${formatCurrency(-saved)}`}
						against the {formatCurrency(data.targetPence)} target
					{:else}
						— <a href="/overview/trends/{data.monthKey}" class="bracket-link">set a monthly target</a> to track pace
					{/if}
				</p>
				{#if data.targetPence > 0}
					<TargetPaceChart
						monthKey={data.monthKey}
						targetPence={data.targetPence}
						dailies={data.chosenMonthDailies}
						daysInMonth={data.daysInMonth}
					/>
				{/if}
				<div class="grid grid-cols-2 gap-2">
					<div class="border border-black">
						<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">BY CATEGORY</div>
						{#each data.categories.included as cat (cat.name)}
							<div class="flex justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0">
								<span>{cat.name}</span>
								<span class="tabular-nums">{formatCurrency(cat.spentPence)}</span>
							</div>
						{:else}
							<div class="px-2 py-1.5 text-xs text-gray-500">No categorised spend declared.</div>
						{/each}
					</div>
					<div class="border border-black">
						<div class="bg-gray-100 border-b border-black px-2 py-1 text-sm font-bold">EXCLUDED FROM TARGET</div>
						{#each data.categories.excluded as cat (cat.name)}
							<div class="flex justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0">
								<span>{cat.name}</span>
								<span class="tabular-nums text-gray-600">{formatCurrency(cat.spentPence)}</span>
							</div>
						{:else}
							<div class="px-2 py-1.5 text-xs text-gray-500">Nothing excluded this month.</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="flex justify-between items-center">
		<a href="/overview/trends/{data.monthKey}" class="bracket-link text-xs">← Monthly Trend</a>
		<a href="/overview/trends/all" class="bracket-link text-xs">Trend history</a>
	</div>
</div>
