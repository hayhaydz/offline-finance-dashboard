<script lang="ts">
	import { formatCurrency, formatDateShorthand } from '$lib/utils/currency';
	import type { StoozeStatus, CardSplitSummary } from '$lib/server/credit-engine';

	/**
	 * CreditModePanel (v3 B05 / R7): per-card strategy switcher + stooze
	 * reminders. In stooze mode this is the ONLY credit panel — friendly
	 * dates and amounts, zero payoff pressure. The payoff machinery
	 * (DebtProjectionSection) renders only in panic mode, from the page.
	 */
	let {
		slug,
		mode,
		stooze,
		splits
	}: {
		slug: string;
		mode: 'panic' | 'stooze' | null;
		stooze: StoozeStatus | null;
		splits: CardSplitSummary | null;
	} = $props();
</script>

<div class="border-b border-black">
	<div class="font-bold flex flex-nowrap items-center gap-3 justify-between bg-gray-100 border-b border-black p-2">
		<span>CREDIT STRATEGY</span>
		<div class="flex gap-1">
			<form method="POST" action="?/setCreditMode" class="inline">
				<input type="hidden" name="mode" value="panic" />
				<button
					type="submit"
					class="bracket-link text-xs"
					class:bg-gray-200={mode === 'panic'}
					class:font-bold={mode === 'panic'}
					title="Actively paying this debt down — shows payoff planning"
				>
					Pay off
				</button>
			</form>
			<form method="POST" action="?/setCreditMode" class="inline">
				<input type="hidden" name="mode" value="stooze" />
				<button
					type="submit"
					class="bracket-link text-xs"
					class:bg-gray-200={mode === 'stooze'}
					class:font-bold={mode === 'stooze'}
					title="Riding the 0% period while savings earn — reminders only"
				>
					Stooze 0%
				</button>
			</form>
			{#if mode !== null}
				<form method="POST" action="?/setCreditMode" class="inline">
					<input type="hidden" name="mode" value="clear" />
					<button type="submit" class="bracket-link text-xs" title="Unset strategy">Clear</button>
				</form>
			{/if}
		</div>
	</div>

	<div class="p-2 text-xs space-y-1">
		{#if mode === null}
			<p class="text-gray-700">
				No strategy set. <span class="font-bold">[Pay off]</span> if you're actively clearing
				this card — <span class="font-bold">[Stooze 0%]</span> if you're using the interest-free
				period while your money earns elsewhere.
			</p>
		{:else if mode === 'stooze'}
			{#if stooze?.stoozing}
				<!-- friendly reminders only — no payoff pressure (R7) -->
				<div class="flex justify-between">
					<span>0% window ends</span>
					<span class="font-bold">{formatDateShorthand(stooze.promoEndsAt)} ({stooze.daysLeft} days)</span>
				</div>
				<div class="flex justify-between">
					<span>Have this ready to clear it</span>
					<span class="font-bold">{formatCurrency(stooze.clearAmountPence ?? 0)}</span>
				</div>
				<div class="flex justify-between">
					<span>Pay by (clearing buffer)</span>
					<span class="font-bold">{formatDateShorthand(stooze.clearBy)}</span>
				</div>
				<p class="text-gray-600 pt-1">
					While the 0% runs, this balance costs nothing — the same money in savings is
					earning interest. No payments needed until the clear-by date.
				</p>
			{:else}
				<p class="text-gray-700">
					Stooze mode, but no active 0% window
					{#if stooze?.promoEndsAt}
						(ended {formatDateShorthand(stooze.promoEndsAt)})
					{/if}
					. Set the promo end date to get reminders:
				</p>
				<form method="POST" action="?/setPromoWindow" class="flex flex-nowrap items-center gap-2 pt-1">
					<label for="promoEnd" class="whitespace-nowrap">0% ends</label>
					<input
						type="date"
						id="promoEnd"
						name="promoEnd"
						required
						class="border border-black px-1 py-0.5 text-xs font-mono"
					/>
					<label for="revertApr" class="whitespace-nowrap">then APR %</label>
					<input
						type="text"
						id="revertApr"
						name="revertApr"
						placeholder="24.9"
						class="w-16 border border-black px-1 py-0.5 text-xs font-mono"
					/>
					<button type="submit" class="bracket-link text-xs">Save window</button>
				</form>
				{#if stooze?.promoEndsAt}
					<p class="text-xs text-gray-500 pt-1">Or switch to <span class="font-bold">[Pay off]</span> to plan clearing it.</p>
				{/if}
			{/if}
		{:else if mode === 'panic'}
			<p class="text-gray-700">
				Pay-off mode — the projection, payment suggestions and scenarios below are your
				plan. Stoozing this card? Switch to <span class="font-bold">[Stooze 0%]</span> to hide
				the pressure and see reminders instead.
			</p>
		{/if}

		{#if splits && splits.chargesTracked > 0}
			<div class="border-t border-gray-200 pt-1 mt-1 flex flex-nowrap gap-4 justify-between">
				<span>
					{#if mode === 'stooze'}
						<!-- v3.1 A05: neutral count only — on-track/behind colouring and
						     deadlines are payoff pressure; they live inside the toggle -->
						Splits tracked: {splits.chargesTracked}
						{#if splits.clearedCount > 0}
							<span class="text-gray-500">· {splits.clearedCount} cleared</span>
						{/if}
						<span class="text-gray-500">· detail below</span>
					{:else}
						Splits tracked: {splits.chargesTracked}
						<span class="text-green-700 font-bold">· {splits.onTrackCount} on track</span>
						{#if splits.behindCount > 0}
							<span class="text-amber-700 font-bold">· {splits.behindCount} behind</span>
						{/if}
						{#if splits.clearedCount > 0}
							<span class="text-gray-500">· {splits.clearedCount} cleared</span>
						{/if}
					{/if}
				</span>
				{#if splits.nextDeadline && mode !== 'stooze'}
					<span>Next target: <span class="font-bold">{formatDateShorthand(splits.nextDeadline)}</span></span>
				{/if}
			</div>
		{/if}
	</div>
</div>
