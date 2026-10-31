<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import type { ChargePlanStatus } from '$lib/server/credit-engine';

	/**
	 * SplitsSection (v3 B05 / R8 R20): the Monzo-method split tracker for a
	 * credit card. Every charge can be treated as pay-off-immediately [now]
	 * or over time [3mo]; each row shows confirmed progress through the
	 * last month-end (statement-delay reality), the per-month requirement
	 * to hit the 3-month target, and what going past the interest-free
	 * deadline costs at the revert APR.
	 *
	 * v3.1 A05 (register row 7): in non-panic modes the planning table is
	 * pressure — it collapses behind a toggle; the strategy panel's
	 * summary line keeps the glance. Panic mode expands it (it IS the plan).
	 */
	type ChargeDetail = {
		slug: string;
		description: string | null;
		amountPence: number;
		date: Date;
		status: ChargePlanStatus;
	};

	let {
		details,
		cardBalancePence = null,
		initiallyExpanded = true
	}: {
		details: ChargeDetail[];
		/** live card balance — powers the reconciliation footer */
		cardBalancePence?: number | null;
		/** false = stooze/null mode: header + toggle only */
		initiallyExpanded?: boolean;
	} = $props();

	let userToggle = $state<boolean | null>(null);
	// null = follow the mode default; clicking overrides for this visit
	const expanded = $derived(userToggle ?? initiallyExpanded);

	// v3.1 third mandate: the tracked charges are ORIGINAL amounts; the
	// card balance nets off confirmed payments/refunds — vision flagged
	// the unreconciled £2,585 vs £2,315. State the bridge, don't hide it.
	const trackedTotalPence = $derived(details.reduce((s, d) => s + d.amountPence, 0));
	const reconcilesExactly = $derived(
		cardBalancePence != null && details.length > 0
			? Math.abs(Math.abs(cardBalancePence) - trackedTotalPence) <= 100
			: false
	);
</script>

<div class="border-b border-black">
	<div class="font-bold flex justify-between items-center bg-gray-100 border-b border-black p-2">
		<span>SPLITS — CHARGE PAY-OFF TRACKER</span>
		<span class="text-xs font-normal text-gray-600 flex items-center gap-2">
			{#if details.length && !expanded}
				<span title="Planning detail hidden in stooze mode — the strategy panel keeps the summary. Toggle to plan a charge.">{details.length} charge{details.length === 1 ? '' : 's'} tracked</span>
			{/if}
			<span>confirmed through {details.length ? formatDateShorthand(details[0].status.confirmedThrough) : ''}</span>
			{#if details.length > 0}
				<button
					type="button"
					class="bracket-link"
					aria-expanded={expanded}
					onclick={() => (userToggle = !expanded)}
				>
					{expanded ? 'Hide charges' : `Show ${details.length} charge${details.length === 1 ? '' : 's'}`}
				</button>
			{/if}
		</span>
	</div>
	{#if details.length === 0}
		<div class="p-2 text-xs text-gray-500">No card charges yet — purchases appear here to plan.</div>
	{:else if expanded}
		<div class="overflow-x-auto">
			<table>
				<thead>
					<tr>
						<th class="pl-2 text-left">Charge</th>
						<th class="text-left">Treat as</th>
						<th class="text-right">Confirmed</th>
						<th class="text-right">Per month</th>
						<th class="text-right">Deadline</th>
						<th class="text-right pr-1">Late cost</th>
					</tr>
				</thead>
				<tbody>
					{#each details as d (d.slug)}
						<tr class="border-b border-gray-200 last:border-b-0">
							<td class="pl-2 text-sm py-2">
								<div class="font-bold">{d.description ?? 'Card purchase'}</div>
								<div class="text-xs text-gray-500">
									{formatDateShorthand(d.date)} · {formatCurrency(d.amountPence)}
									{#if d.status.remainingPence <= 0}
										· <span class="text-gray-500">cleared</span>
									{:else if d.status.onTrack}
										· <span class="text-green-700 font-bold">on track</span>
									{:else}
										· <span class="text-amber-700 font-bold">behind</span>
									{/if}
								</div>
							</td>
							<td class="text-sm py-2 whitespace-nowrap">
								<div class="flex gap-1">
									<form method="POST" action="?/setPayoffPlan" class="inline">
										<input type="hidden" name="transactionSlug" value={d.slug} />
										<input type="hidden" name="plan" value="immediate" />
										<button
											type="submit"
											class="bracket-link text-xs"
											class:bg-gray-200={d.status.plan === 'immediate'}
											class:font-bold={d.status.plan === 'immediate'}
											title="Pay off with the next statement"
										>
											now
										</button>
									</form>
									<form method="POST" action="?/setPayoffPlan" class="inline">
										<input type="hidden" name="transactionSlug" value={d.slug} />
										<input type="hidden" name="plan" value="over_time" />
										<button
											type="submit"
											class="bracket-link text-xs"
											class:bg-gray-200={d.status.plan === 'over_time'}
											class:font-bold={d.status.plan === 'over_time'}
											title="Split over 3 months"
										>
											3mo
										</button>
									</form>
								</div>
							</td>
							<td class="text-right text-sm tabular-nums py-2 whitespace-nowrap">
								{formatCurrency(d.status.confirmedPaidPence)}
								<span class="text-gray-500 text-xs"> / {formatCurrency(d.amountPence)}</span>
							</td>
							<td class="text-right text-sm tabular-nums py-2 whitespace-nowrap">
								{#if d.status.remainingPence > 0}
									{formatCurrency(d.status.requiredPerMonthPence)}
									{#if d.status.plan === 'over_time'}
										<span class="text-gray-500 text-xs"> × {Math.max(0, d.status.targetMonths - d.status.monthsElapsed)}mo</span>
									{:else}
										<span class="text-gray-500 text-xs"> next statement</span>
									{/if}
								{:else}
									—
								{/if}
							</td>
							<td class="text-right text-sm tabular-nums py-2 whitespace-nowrap">
								{formatDateShorthand(d.status.deadline)}
							</td>
						<td class="text-right pr-1 text-sm tabular-nums py-2 whitespace-nowrap">
							{#if d.status.flexCostPence > 0}
								<span class="text-red-700 font-bold">{formatCurrency(d.status.flexCostPence)}</span>
							{:else if d.status.remainingPence > 0}
								<!-- v3.1: "free until deadline" under an "If late" header read as a
								     contradiction — the column states the COST of missing the
								     deadline; inside the 0% window that cost is £0 -->
								<span class="text-gray-500 text-xs">£0 — inside 0% window</span>
							{:else}
								—
							{/if}
						</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="p-2 text-xs text-gray-500 border-t border-gray-200">
			[now] = clear with the next statement. [3mo] = split across 3 months — each month's
			payments mark progress. On track = confirmed payments keep the target reachable; behind =
			the remaining months need more than average. Payments without a target pay the earliest
			deadline first. Going past a deadline costs the card's normal APR on what's left.
			{#if cardBalancePence != null && details.length > 0}
				Tracked charges {formatCurrency(trackedTotalPence)}
				{reconcilesExactly
					? ` = card balance — nothing further on the card`
					: ` vs card balance ${formatCurrency(Math.abs(cardBalancePence))} — difference = charges outside the tracker, payments and refunds`}
			{/if}
		</p>
	{/if}
</div>
