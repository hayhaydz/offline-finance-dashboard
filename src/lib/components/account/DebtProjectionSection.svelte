<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { calculateTTZ } from '$lib/utils/debt-calculator';

	type TtzData = {
		months: number | null;
		years: number | null;
		totalInterest: number | null;
	};

	type ProjectionRow = {
		month: number;
		balance: number;
		interest: number;
		payment: number;
	};

	type OverpaymentScenario = {
		label: string;
		payment: number;
		ttzMonths: number | null;
		totalInterest: number | null;
		debtFreeDate: string | null;
	};

	type RateScenario = {
		label: string;
		rate: number;
		ttzMonths: number | null;
		ttzDelta: number | null;
		totalInterest: number | null;
		debtFreeDate: string | null;
	};

	let {
		currentBalance,
		currentRate,
		projection,
		ttz,
		debtHealthStatus,
		paymentSuggestion,
		overpaymentScenarios,
		rateScenarios,
		breakEvenMonthIndex,
		liabilityContext,
		minimumPaymentType,
		minimumPaymentFlat,
		minimumPaymentPercentage,
		creditLimit,
		originalPrincipal,
		accountSlug,
	}: {
		currentBalance: number;
		currentRate: number | null;
		projection: ProjectionRow[] | null;
		ttz: TtzData | null;
		debtHealthStatus: { label: string; class: string } | null;
		paymentSuggestion: { suggestedPayment: number; monthsSaved: number; interestSaved: number } | null;
		overpaymentScenarios: OverpaymentScenario[] | null;
		rateScenarios: RateScenario[] | null;
		breakEvenMonthIndex: number | null;
		liabilityContext: { strategy: string | null; totalLiabilities: number } | null;
		minimumPaymentType: string | null;
		minimumPaymentFlat: number | null;
		minimumPaymentPercentage: number | null;
		creditLimit: number | null;
		originalPrincipal: number | null;
		accountSlug: string;
	} = $props();

	let projectionLength = $state(12);
	let projectionExpanded = $state(false);
	const paginatedProjection = $derived(projection?.slice(0, projectionLength) ?? []);

	const periodTotalInterest = $derived(paginatedProjection.reduce((s, r) => s + r.interest, 0));
	const periodTotalPayments = $derived(paginatedProjection.reduce((s, r) => s + r.payment, 0));
	const periodEndBalance = $derived(paginatedProjection.at(-1)?.balance ?? null);

	const debtFreeDate = $derived.by(() => {
		if (!ttz?.months) return null;
		const d = new Date();
		d.setMonth(d.getMonth() + ttz.months);
		return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
	});

	const paymentEfficiency = $derived.by(() => {
		if (!projection?.length || !projection[0].payment) return null;
		const interest = projection[0].interest;
		const payment = projection[0].payment;
		return {
			interestAmt: interest,
			principalAmt: payment - interest,
			interestPct: Math.round(interest / payment * 100)
		};
	});

	const lifetimeRatio = $derived.by(() => {
		if (ttz?.totalInterest == null) return null;
		const totalRepayment = currentBalance + ttz.totalInterest;
		if (totalRepayment <= 0) return null;
		return {
			totalRepayment,
			interestPct: Math.round(ttz.totalInterest / totalRepayment * 100)
		};
	});

	const cumulativeProjectionInterest = $derived(
		paginatedProjection.reduce<number[]>((acc, row) => {
			acc.push((acc.at(-1) ?? 0) + row.interest);
			return acc;
		}, [])
	);

	// Overpayment simulator
	const effectiveMinPayment = $derived.by(() => {
		if (!ttz || ttz.months === null) return 0;
		const b = Math.abs(currentBalance);
		if (minimumPaymentType === 'flat' && minimumPaymentFlat) return minimumPaymentFlat;
		if (minimumPaymentType === 'percentage' && minimumPaymentPercentage)
			return Math.round((b * minimumPaymentPercentage) / 10000);
		if (minimumPaymentType === 'flat_or_percentage' && minimumPaymentFlat && minimumPaymentPercentage)
			return Math.max(minimumPaymentFlat, Math.round((b * minimumPaymentPercentage) / 10000));
		return Math.round(b * 0.01);
	});

	let simulatorInputStr = $state('');
	let simulatorPayment = $state(0);

	$effect(() => {
		if (effectiveMinPayment > 0 && simulatorPayment === 0) {
			simulatorPayment = effectiveMinPayment;
			simulatorInputStr = (effectiveMinPayment / 100).toFixed(2);
		}
	});

	$effect(() => {
		const raw = simulatorInputStr;
		const t = setTimeout(() => {
			const parsed = Math.round(parseFloat(raw) * 100);
			if (!Number.isNaN(parsed) && parsed > 0) simulatorPayment = parsed;
		}, 200);
		return () => clearTimeout(t);
	});

	const simulatorResult = $derived.by(() => {
		if (!ttz || ttz.months === null || simulatorPayment <= 0) return null;
		const balance = Math.abs(currentBalance);
		const rate = currentRate ?? 0;
		const result = calculateTTZ(balance, rate, { type: 'flat', flat: simulatorPayment });
		if (result.months === null) return null;
		const d = new Date();
		d.setMonth(d.getMonth() + result.months);
		const dfd = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
		return { months: result.months, totalInterest: result.totalInterest, debtFreeDate: dfd };
	});

	const simulatorDiff = $derived.by(() => {
		if (!simulatorResult || !ttz?.months || !ttz.totalInterest) return null;
		if (simulatorPayment === effectiveMinPayment) return null;
		const monthsSaved = ttz.months - simulatorResult.months;
		const interestSaved = (ttz.totalInterest ?? 0) - (simulatorResult.totalInterest ?? 0);
		if (monthsSaved <= 0 && interestSaved <= 0) return null;
		return { monthsSaved, interestSaved };
	});

	const showSimulator = $derived(ttz && ttz.months !== null);
</script>

{#if projection}
	<!-- Header with status badge -->
	<div class="border-y border-black bg-gray-100 p-2 font-bold flex justify-between items-center">
		<div class="flex items-center gap-2">
			<span>DEBT PROJECTION</span>
			{#if debtHealthStatus}
				<span class="text-xs font-bold {debtHealthStatus.class}">{debtHealthStatus.label}</span>
			{/if}
		</div>
		<div class="flex items-center gap-3">
			<a href="/accounts/liabilities" class="bracket-link text-xs">View Breakdown</a>
			<button
				type="button"
				onclick={() => projectionExpanded = !projectionExpanded}
				class="bracket-link text-xs font-normal"
			>
				{projectionExpanded ? 'Collapse' : 'Expand Projection'}
			</button>
		</div>
	</div>

	<!-- Minimum payment trap warning -->
	{#if ttz?.months !== null && ttz?.months !== undefined && ttz.months > 120}
		<div class="px-2 py-1 border-b border-black text-xs text-red-700">
			[WARNING] At minimum payments, this debt takes {ttz.years !== null ? `${Math.ceil(ttz.years || 0)} years` : `${ttz.months} months`} and costs £{(ttz.totalInterest != null ? ttz.totalInterest / 100 : 0).toFixed(2)} in interest.
		</div>
	{/if}

	<!-- Summary Box -->
	<div class="p-2">
		<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
			<!-- Time to Zero -->
			<div>Time to Zero:</div>
			<div class="text-right font-bold">
				{#if ttz && ttz.months !== null}
					{#if ttz.years !== null && ttz.years < 1}
						{ttz.months} months
					{:else}
						{Math.floor(ttz.years || 0)}y {Math.round(((ttz.years || 0) % 1) * 12)}m
					{/if}
				{:else}
					<span class="text-amber-700">Never pays off</span>
				{/if}
			</div>

			<!-- Debt-free date -->
			{#if debtFreeDate}
				<div class="text-gray-500">Debt-free:</div>
				<div class="text-right font-bold">{debtFreeDate}</div>
			{/if}

			<!-- Monthly Interest -->
			<div>Monthly Interest:</div>
			<div class="text-right font-bold tabular-nums text-amber-700">
				{#if projection && projection[0]}
					£{(projection[0].interest / 100).toFixed(2)}
					<span class="font-normal text-xs">(£{(projection[0].interest / 30.44 / 100).toFixed(2)}/day)</span>
				{:else}
					£0.00
				{/if}
			</div>

			<!-- Total cost to clear -->
			{#if ttz?.totalInterest != null}
				<div>Total Interest Cost:</div>
				<div class="text-right font-bold text-red-700">£{(ttz.totalInterest / 100).toFixed(2)}</div>
			{/if}

			<!-- Interest:principal lifetime ratio -->
			{#if lifetimeRatio !== null}
				<div class="text-gray-500">Of total repayment:</div>
				<div class="text-right tabular-nums {lifetimeRatio.interestPct > 30 ? 'text-amber-700' : ''}">
					{lifetimeRatio.interestPct}% interest
					<span class="text-gray-500 font-normal text-xs">(£{(ttz!.totalInterest! / 100).toFixed(2)} of £{(lifetimeRatio.totalRepayment / 100).toFixed(2)})</span>
				</div>
			{/if}

			<!-- Payment efficiency -->
			{#if paymentEfficiency !== null}
				<div class="text-gray-500">Payment breakdown:</div>
				<div class="text-right tabular-nums text-xs">
					<span class="text-amber-700">£{(paymentEfficiency.interestAmt / 100).toFixed(2)} interest ({paymentEfficiency.interestPct}%)</span>
					<span class="text-gray-400"> · </span>
					<span class="text-green-700">£{(paymentEfficiency.principalAmt / 100).toFixed(2)} principal</span>
				</div>
			{/if}

			<!-- Utilization (revolving) or Progress (installment) -->
			{#if creditLimit}
				<div>Utilization:</div>
				<div class="text-right font-bold">{(currentBalance / creditLimit * 100).toFixed(1)}%</div>
			{:else if originalPrincipal}
				<div>Progress:</div>
				<div class="text-right font-bold">{((originalPrincipal - currentBalance) / originalPrincipal * 100).toFixed(1)}%</div>
			{/if}
		</div>

		<!-- Payment Suggestion -->
		{#if paymentSuggestion}
			<div class="mt-2 pt-2 border-t border-gray-300 text-xs">
				<span class="text-gray-700">Suggested: </span>
				<span class="font-bold text-green-700">£{paymentSuggestion.suggestedPayment / 100}</span>
				<span class="text-gray-700">
					(pays off {paymentSuggestion.monthsSaved} months faster, saves £{paymentSuggestion.interestSaved / 100})
				</span>
			</div>
		{/if}

		<!-- Inline Overpayment Simulator -->
		{#if showSimulator}
			<div class="mt-2 pt-2 border-t border-gray-300">
				<div class="text-xs text-gray-500 mb-1">Overpayment simulator:</div>
				<div class="flex items-baseline gap-2 flex-wrap">
					<label for="simulatorInput" class="text-sm">Payment: £</label>
					<input
						id="simulatorInput"
						type="number"
						step="0.01"
						min={(effectiveMinPayment / 100).toFixed(2)}
						max={(Math.abs(currentBalance) / 100).toFixed(2)}
						bind:value={simulatorInputStr}
						class="border border-black px-1 py-0.5 text-sm font-mono w-24 focus:outline-none"
					/>
					<span class="text-xs text-gray-500">(minimum: £{(effectiveMinPayment / 100).toFixed(2)})</span>
				</div>
				{#if simulatorResult}
					<div class="mt-1 text-xs tabular-nums">
						TTZ: <span class="font-bold">{simulatorResult.months} months</span>
						<span class="text-gray-400"> · </span>
						Interest: <span class="font-bold text-amber-700">£{((simulatorResult.totalInterest ?? 0) / 100).toFixed(2)}</span>
						<span class="text-gray-400"> · </span>
						Debt-free: <span class="font-bold text-green-700">{simulatorResult.debtFreeDate}</span>
					</div>
					{#if simulatorDiff}
						<div class="mt-1 text-xs text-green-700">
							Saves {simulatorDiff.monthsSaved} month{simulatorDiff.monthsSaved !== 1 ? 's' : ''} and £{(simulatorDiff.interestSaved / 100).toFixed(2)} in interest
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Overpayment Scenario Comparison (hidden when simulator is shown) -->
		{#if overpaymentScenarios && !showSimulator}
			<div class="mt-2 pt-2 border-t border-gray-300">
				<div class="text-xs text-gray-500 mb-1">Overpayment scenarios:</div>
				<div class="overflow-x-auto">
					<table class="w-full text-xs tabular-nums border-collapse">
						<thead>
							<tr class="bg-gray-100 border-b border-gray-300">
								<th class="text-left py-1 pr-2 font-normal text-gray-500"></th>
								{#each overpaymentScenarios as scenario}
									<th class="text-right py-1 px-1 font-bold">{scenario.label}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Payment</td>
								{#each overpaymentScenarios as scenario}
									<td class="text-right px-1">{formatCurrency(scenario.payment)}</td>
								{/each}
							</tr>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Months to clear</td>
								{#each overpaymentScenarios as scenario}
									<td class="text-right px-1">{scenario.ttzMonths !== null ? `${scenario.ttzMonths}m` : '—'}</td>
								{/each}
							</tr>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Total interest</td>
								{#each overpaymentScenarios as scenario}
									<td class="text-right px-1 text-amber-700">{scenario.totalInterest !== null ? formatCurrency(scenario.totalInterest) : '—'}</td>
								{/each}
							</tr>
							<tr>
								<td class="py-1 pr-2 text-gray-500">Debt-free</td>
								{#each overpaymentScenarios as scenario}
									<td class="text-right px-1 text-green-700">{scenario.debtFreeDate ?? '—'}</td>
								{/each}
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Rate Change Stress Test -->
		{#if rateScenarios && rateScenarios.length > 0}
			<div class="mt-2 pt-2 border-t border-gray-300">
				<div class="text-xs text-gray-500 mb-1">Rate stress test:</div>
				<div class="overflow-x-auto">
					<table class="w-full text-xs tabular-nums border-collapse">
						<thead>
							<tr class="bg-gray-100 border-b border-gray-300">
								<th class="text-left py-1 pr-2 font-normal text-gray-500"></th>
								<th class="text-right py-1 px-1 font-bold text-gray-500">Current</th>
								{#each rateScenarios as scenario}
									<th class="text-right py-1 px-1 font-bold text-amber-700">{scenario.label}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Rate</td>
								<td class="text-right px-1">{currentRate !== null ? (currentRate / 100).toFixed(2) : '—'}%</td>
								{#each rateScenarios as scenario}
									<td class="text-right px-1 text-amber-700">{(scenario.rate / 100).toFixed(2)}%</td>
								{/each}
							</tr>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Months to clear</td>
								<td class="text-right px-1">{ttz?.months !== null ? `${ttz?.months}m` : '—'}</td>
								{#each rateScenarios as scenario}
									<td class="text-right px-1">
										{scenario.ttzMonths !== null ? `${scenario.ttzMonths}${scenario.ttzMonths >= 300 ? '+' : ''}m` : '—'}
										{#if scenario.ttzDelta !== null && scenario.ttzDelta > 0}
											<span class="text-amber-700">(+{scenario.ttzDelta})</span>
										{/if}
									</td>
								{/each}
							</tr>
							<tr class="border-b border-gray-200">
								<td class="py-1 pr-2 text-gray-500">Total interest</td>
								<td class="text-right px-1">{ttz?.totalInterest !== null && ttz?.totalInterest !== undefined ? formatCurrency(ttz.totalInterest) : '—'}</td>
								{#each rateScenarios as scenario}
									<td class="text-right px-1 text-amber-700">{scenario.totalInterest !== null ? formatCurrency(scenario.totalInterest) : '—'}</td>
								{/each}
							</tr>
							<tr>
								<td class="py-1 pr-2 text-gray-500">Debt-free</td>
								<td class="text-right px-1 text-green-700">{debtFreeDate ?? '—'}</td>
								{#each rateScenarios as scenario}
									<td class="text-right px-1 text-red-700">{scenario.debtFreeDate ?? '—'}</td>
								{/each}
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Debt Payoff Strategy Tip -->
		{#if liabilityContext?.strategy != null && liabilityContext.totalLiabilities > 1}
			<div class="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-700">
				[TIP] Pay this account first — {liabilityContext.strategy === 'avalanche' ? 'highest rate' : 'smallest balance'} across your {liabilityContext.totalLiabilities} debts ({liabilityContext.strategy} method)
			</div>
		{/if}
		<div class="mt-2 pt-2 border-t border-gray-300">
			<div class="flex items-center gap-3 text-xs mb-2">
				<span class="text-gray-500">Period:</span>
				{#each [6, 12, 24] as months}
					<button
						type="button"
						class="bracket-link"
						class:font-bold={projectionLength === months}
						onclick={() => { projectionLength = months; projectionExpanded = true; }}
					>
						{months}m
					</button>
				{/each}
			</div>
			{#if paginatedProjection.length > 0}
				<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums text-gray-700">
					<div>Interest ({projectionLength}m):</div>
					<div class="text-right font-bold text-amber-700">£{(periodTotalInterest / 100).toFixed(2)}</div>
					<div>Payments ({projectionLength}m):</div>
					<div class="text-right font-bold">£{(periodTotalPayments / 100).toFixed(2)}</div>
					{#if periodEndBalance !== null}
						<div>Balance after {projectionLength}m:</div>
						<div class="text-right font-bold {periodEndBalance <= 0 ? 'text-green-700' : ''}">
							£{(periodEndBalance / 100).toFixed(2)}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Projection Table -->
	{#if projectionExpanded}
		<div class="border-b border-black p-2">
			<table class="projection-table w-full table-fixed min-w-[400px]">
				<thead>
					<tr>
						<th class="pl-2 text-left whitespace-nowrap w-[20%]">Month</th>
						<th class="text-right pr-1 whitespace-nowrap w-[20%]">Balance</th>
						<th class="text-right pr-1 whitespace-nowrap w-[20%]">Interest</th>
						<th class="text-right pr-1 whitespace-nowrap w-[20%]">Payment</th>
						<th class="text-right pr-2 whitespace-nowrap w-[20%]">Total Int.</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedProjection as row, i}
						<tr class="border-b border-gray-200 last:border-b-0 align-top">
							<td class="pl-2 text-sm py-2 whitespace-nowrap">{row.month}</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap {row.balance >= 0 ? 'text-green-700' : 'text-red-700'}">
								£{row.balance / 100}
							</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap text-amber-700">
								£{row.interest / 100}
							</td>
							<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap text-green-700">
								£{row.payment / 100}
							</td>
							<td class="text-right pr-2 text-sm tabular-nums py-2 whitespace-nowrap text-amber-700">
								£{((cumulativeProjectionInterest[i] ?? 0) / 100).toFixed(2)}
								{#if breakEvenMonthIndex === i}
									<div class="text-xs text-red-700 font-normal whitespace-normal text-right">← crossover: cumulative interest now exceeds original principal</div>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}
