<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import type { ActionData, PageData } from './$types';

	let { data, form } = $props<{
		data: PageData;
		form: ActionData;
	}>();

	const getMaxWithdrawCents = () => data.goal.currentAllocation;
	const getMaxWithdrawPounds = () => Math.floor(getMaxWithdrawCents() / 100);
	const getMonthlyExpenseCents = () =>
		data.goal.targetAmountInCents > 0 ? data.goal.targetAmountInCents / 12 : 0;

	let amountPounds = $state(Math.min(1500, getMaxWithdrawPounds()));

	function setAmount(nextPounds: number) {
		amountPounds = Math.max(0, Math.min(getMaxWithdrawPounds(), nextPounds));
	}

	function setAmountFromInput(value: string) {
		const digits = value.replace(/[^\d]/g, '');
		setAmount(digits ? parseInt(digits, 10) : 0);
	}

	function monthsCovered(cents: number): string {
		if (getMonthlyExpenseCents() <= 0) return '0';
		const months = cents / getMonthlyExpenseCents();
		return months.toFixed(1).replace('.0', '');
	}

	function monthsCoveredWhole(cents: number): string {
		if (getMonthlyExpenseCents() <= 0) return '0';
		return String(Math.max(0, Math.round(cents / getMonthlyExpenseCents())));
	}

	const MILESTONES = [1, 3, 6, 12];
	function crossedMilestones(currentCents: number, nextCents: number): number[] {
		if (getMonthlyExpenseCents() <= 0) return [];
		const currentMonths = currentCents / getMonthlyExpenseCents();
		const nextMonths = nextCents / getMonthlyExpenseCents();
		return MILESTONES.filter(
			(milestone) => currentMonths >= milestone && nextMonths < milestone,
		);
	}

	const amountCents = $derived.by(() => amountPounds * 100);
	const newGoalBalance = $derived.by(() => Math.max(0, data.goal.currentAllocation - amountCents));
	const currentProgress = $derived.by(() =>
		data.goal.targetAmountInCents > 0
			? (data.goal.currentAllocation / data.goal.targetAmountInCents) * 100
			: 0,
	);
	const newProgress = $derived.by(() =>
		data.goal.targetAmountInCents > 0 ? (newGoalBalance / data.goal.targetAmountInCents) * 100 : 0,
	);
	const coverageLabel = $derived.by(
		() => `${monthsCovered(data.goal.currentAllocation)}mo -> ${monthsCovered(newGoalBalance)}mo coverage`,
	);
	const crossed = $derived.by(() =>
		crossedMilestones(data.goal.currentAllocation, newGoalBalance),
	);
	const showMilestoneWarning = $derived.by(() => crossed.length > 0);
	const crossedLabel = $derived.by(() => crossed.map((m) => `${m}mo`).join(", "));
	const coverageWholeLabel = $derived.by(
		() =>
			`${monthsCoveredWhole(data.goal.currentAllocation)}mo -> ${monthsCoveredWhole(newGoalBalance)}mo`,
	);
</script>

<form method="POST" use:enhance >
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-2 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}
	<input type="hidden" name="amount" value={amountPounds} />

	<div class="flex items-end gap-2 mb-2 flex-wrap p-2">
		<div>
			<label class="block mb-1 text-xs text-gray-600" for="amount">Amount</label>
			<input
				id="amount"
				type="text"
				class="border border-black p-1 text-sm font-mono w-36 focus:outline-none"
				value={amountPounds}
				oninput={(e) => setAmountFromInput((e.currentTarget as HTMLInputElement).value)}
			/>
		</div>
	</div>

	<div class="flex items-center gap-2 mb-2 flex-wrap">
		<button type="button" class="bracket-link" onclick={() => setAmount(amountPounds - 100)}>-</button>
		<div class="slider-shell">
			<input
				type="range"
				class="terminal-slider"
				min="0"
				max={getMaxWithdrawPounds()}
				step="100"
				value={amountPounds}
				oninput={(e) => setAmount(parseInt((e.currentTarget as HTMLInputElement).value, 10))}
				style={`--fill: ${getMaxWithdrawPounds() > 0 ? ((amountPounds / getMaxWithdrawPounds()) * 100).toFixed(1) : 0}%`}
			/>
		</div>
		<button type="button" class="bracket-link" onclick={() => setAmount(amountPounds + 100)}>+</button>
	</div>

	<div class="flex gap-2 mb-2 flex-wrap">
		<button type="button" class="bracket-link" onclick={() => setAmount(100)}>£100</button>
		<button type="button" class="bracket-link" onclick={() => setAmount(500)}>£500</button>
		<button type="button" class="bracket-link" onclick={() => setAmount(1000)}>£1k</button>
		<button type="button" class="bracket-link" onclick={() => setAmount(getMaxWithdrawPounds())}>All</button>
	</div>

	<div class="bg-gray-100 p-2 border-t border-black">
		<div class="flex justify-between text-xs mb-1"><span>Goal</span><span>{data.goal.name}</span></div>
		<div class="flex justify-between text-xs mb-1">
			<span>Withdrawing</span><span class="text-amber-700">-{formatCurrency(amountCents)}</span>
		</div>
		<div class="flex justify-between text-xs mb-1">
			<span>Goal Balance</span><span>{formatCurrency(newGoalBalance)} (was {formatCurrency(data.goal.currentAllocation)})</span>
		</div>
		<div class="flex justify-between text-xs mb-1">
			<span>Progress</span>
			<span>{newProgress.toFixed(1).replace('.0', '')}% (was {currentProgress.toFixed(1).replace('.0', '')}%)</span>
		</div>
	</div>

	{#if showMilestoneWarning}
		<div class="bg-amber-50 border-t border-black p-2">
			<div class="text-xs">
				<strong class="text-amber-700">[!] Milestone Drop Detected</strong>
			</div>
			<div class="text-xs text-gray-600">
				This withdrawal crosses below: {crossedLabel}.
			</div>
			<div class="text-xs text-gray-600">
				Coverage changes from {coverageWholeLabel}.
			</div>
		</div>
	{/if}

	<div class="p-2 border-t border-black">
		<button type="submit" class="bracket-link text-sm text-amber-700" disabled={amountCents <= 0}>
			Confirm Withdraw {formatCurrency(amountCents)}
		</button>
		<a href="/goals/{data.goal.slug}" class="bracket-link text-sm ml-2">Cancel</a>
	</div>
</form>

<style>
	.slider-shell {
		border: 0;
		background: #fff;
		padding: 0;
		display: flex;
		align-items: center;
	}

	.terminal-slider {
		appearance: none;
		-webkit-appearance: none;
		width: 280px;
		height: 16px;
		border: 1px solid #000;
		background:
			linear-gradient(to right, #efefef 0%, #efefef var(--fill, 35.7%), #fff var(--fill, 35.7%), #fff 100%),
			repeating-linear-gradient(to right, transparent 0, transparent 9px, #000 9px, #000 10px);
		outline: none;
	}

	.terminal-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 8px;
		height: 16px;
		border: 1px solid #000;
		background: #000;
		cursor: pointer;
		margin-top: -1px;
	}

	.terminal-slider::-moz-range-thumb {
		width: 8px;
		height: 16px;
		border: 1px solid #000;
		background: #000;
		cursor: pointer;
		border-radius: 0;
	}

	.terminal-slider::-moz-range-track {
		height: 16px;
		border: 1px solid #000;
		background: #fff;
		border-radius: 0;
	}
</style>
