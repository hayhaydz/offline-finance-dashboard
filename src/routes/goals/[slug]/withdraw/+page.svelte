<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import { DISPLAY_LIMITS, truncateDisplay } from '$lib/utils/fieldLimits';
	import type { PageData, ActionData } from './$types';

	let { data, form } = $props<{
		data: PageData;
		form: ActionData;
	}>();

	let amount = $state('');

	// Quick amount buttons + 'All' per user decision
	const quickAmounts = $derived.by(() => [
		{ label: '£100', value: 10000 },
		{ label: '£500', value: 50000 },
		{ label: '£1k', value: 100000 },
		{ label: 'All', value: data.goal.currentAllocation }
	]);

	// Calculate preview
	const preview = $derived.by(() => {
		if (!amount) return null;

		const amountInCents = parseInt(amount) * 100;
		const newGoalBalance = Math.max(0, data.goal.currentAllocation - amountInCents);
		const newProgress = data.goal.targetAmountInCents > 0
			? (newGoalBalance / data.goal.targetAmountInCents) * 100
			: 0;
		const currentProgress = data.goal.targetAmountInCents > 0
			? (data.goal.currentAllocation / data.goal.targetAmountInCents) * 100
			: 0;

		// Ready to Assign after = current readyToAssign + amount
		// We need to recalculate from server data
		const readyToAssignAfter = data.goal.currentAllocation - amountInCents; // This is returned to pool

		// Warning if withdrawing drops below recent milestone (Emergency Fund only)
		let showWarning = false;
		if (data.goal.isEmergencyFund) {
			const monthlyExpenses = data.goal.targetAmountInCents / 12;
			const milestones = [
				{ label: '1mo', amount: monthlyExpenses },
				{ label: '3mo', amount: monthlyExpenses * 3 },
				{ label: '6mo', amount: monthlyExpenses * 6 },
				{ label: '12mo', amount: monthlyExpenses * 12 }
			];

			// Check if currently above a milestone but would drop below after withdrawal
			for (const milestone of milestones) {
				if (data.goal.currentAllocation >= milestone.amount && newGoalBalance < milestone.amount) {
					showWarning = true;
					break;
				}
			}
		}

		return {
			amount: amountInCents,
			newGoalBalance,
			newProgress: Math.round(newProgress * 10) / 10,
			currentProgress: Math.round(currentProgress * 10) / 10,
			readyToAssignAfter: data.goal.currentAllocation - amountInCents, // Returned to pool
			showWarning
		};
	});

	function setQuickAmount(value: number) {
		amount = (value / 100).toString();
	}
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-0 mt-0">WITHDRAW MONEY: {truncateDisplay(data.goal.name, DISPLAY_LIMITS.GOAL_NAME)}</h1>
</div>

<div class="p-2">
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<form method="POST" use:enhance class="flex flex-col gap-4">
		<!-- Goal Info -->
		<div class="text-center mb-4 pb-4 border-b border-black">
			<div class="font-bold">{truncateDisplay(data.goal.name, DISPLAY_LIMITS.GOAL_NAME)}</div>
			<input
				type="text"
				id="amount"
				name="amount"
				bind:value={amount}
				placeholder="£0"
				class="w-full max-w-md border border-black px-2 py-1 text-sm font-mono"
				inputmode="numeric"
			/>
			<div class="flex gap-1 mt-2">
				{#each quickAmounts as qa}
					<button
						type="button"
						onclick={() => setQuickAmount(qa.value)}
						class="px-2 py-1 border border-black text-xs hover:bg-gray-200"
					>
						{qa.label}
					</button>
				{/each}
			</div>
			{#if form?.errors?.amount}
				<small class="text-red-700 font-bold text-xs block">{form.errors.amount}</small>
			{/if}
		</div>

		<!-- Warning (conditional) -->
		{#if preview?.showWarning}
			<div class="border border-amber-600 bg-amber-50 p-2">
				<div class="text-xs text-amber-900">
					⚠ Withdrawing drops progress below a milestone
				</div>
			</div>
		{/if}

		<!-- Preview -->
		{#if preview}
			<div class="bg-amber-50 border border-black p-3">
				<div class="flex justify-between text-xs mb-1">
					<span>Withdrawing:</span>
					<span class="text-amber-700">-{formatCurrency(preview.amount)}</span>
				</div>
				<div class="flex justify-between text-xs mb-1">
					<span>Goal new balance:</span>
					<span>{formatCurrency(preview.newGoalBalance)}</span>
				</div>
				<div class="flex justify-between text-xs mb-1">
					<span>Progress:</span>
					<span>{preview.newProgress}% (was {preview.currentProgress}%)</span>
				</div>
				<div class="flex justify-between text-xs">
					<span>Ready to Assign after:</span>
					<span class="font-bold">+{formatCurrency(preview.readyToAssignAfter)}</span>
				</div>
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<button
				type="submit"
				class="bg-amber-600 text-white px-4 py-2 text-sm font-bold hover:bg-amber-700"
				disabled={!preview}
			>
				[Withdraw {amount ? `£${amount}` : '£0'}]
			</button>
			<a
				href="/goals/{data.goal.slug}"
				class="border border-black px-4 py-2 text-sm hover:bg-gray-100 no-underline text-black"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
