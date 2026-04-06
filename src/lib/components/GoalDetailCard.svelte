<script lang="ts">
	import { formatCurrency, formatCurrencyShorthand, formatDate } from '$lib/utils/currency';

	interface GoalDisplay {
		name: string;
		slug: string;
		targetAmountInCents: number;
		currentAllocation: number;
		targetDate: Date | null;
		isEmergencyFund: boolean;
		goalType?: 'savings' | 'debt';
		startingBalanceInCents?: number | null;
		linkedAccountSlug?: string | null;
		milestones?: Array<{ label: string; reached: boolean }> | null;
	}

	interface Props {
		goal: GoalDisplay;
		showArchive?: boolean;
	}

	let { goal, showArchive = false }: Props = $props();

	const progressColor = $derived(() => {
		const p = progress();
		if (p >= 70) return 'green';
		if (p >= 30) return 'amber';
		return 'red';
	});

	const progress = $derived(() => {
		if (debtValues()) return debtValues()!.progress;
		return goal.targetAmountInCents > 0
			? Math.min(100, Math.round((goal.currentAllocation / goal.targetAmountInCents) * 100))
			: 0;
	});

	const progressTextColor = $derived(
		progressColor() === 'green' ? 'text-green-700' : progressColor() === 'amber' ? 'text-amber-600' : 'text-red-600'
	);

	const progressBgColor = $derived(
		progressColor() === 'green' ? 'bg-green-700' : progressColor() === 'amber' ? 'bg-amber-600' : 'bg-red-600'
	);

	const emergencyFundMilestones = $derived(() => {
		if (!goal.isEmergencyFund) return null;

		const monthlyExpenses = goal.targetAmountInCents / 12;
		const current = goal.currentAllocation;

		return [
			{ label: '1mo', amount: monthlyExpenses, achieved: current >= monthlyExpenses },
			{ label: '3mo', amount: monthlyExpenses * 3, achieved: current >= monthlyExpenses * 3 },
			{ label: '6mo', amount: monthlyExpenses * 6, achieved: current >= monthlyExpenses * 6 },
			{ label: '12mo', amount: monthlyExpenses * 12, achieved: current >= monthlyExpenses * 12 }
		];
	});

	const remaining = $derived(Math.max(0, goal.targetAmountInCents - goal.currentAllocation));

	// Debt-specific calculations
	const debtValues = $derived(() => {
		if (goal.goalType === 'debt' && goal.startingBalanceInCents) {
			const starting = Math.abs(goal.startingBalanceInCents);
			const paid = Math.abs(goal.currentAllocation);
			const debtRemaining = starting - paid;
			const debtProgress = starting > 0 ? Math.round((paid / starting) * 100) : 0;
			return { starting, paid, remaining: debtRemaining, progress: debtProgress };
		}
		return null;
	});
</script>

<div class="p-2 bg-gray-50">
	<!-- Progress Bar -->
	<div class="flex items-center gap-2 text-sm leading-none font-bold {progressTextColor} mb-2">
		<span>[</span>
		<div class="flex-1 h-6 relative border-y border-gray-100">
			<div class="absolute inset-0 flex justify-between opacity-20">
				{#each Array(40) as _}
					<div class="w-px h-full bg-current"></div>
				{/each}
			</div>
			<div
				class="h-full {progressBgColor} transition-all duration-300 mix-blend-multiply"
				style="width: {progress()}%"
			></div>
		</div>
		<span>]</span>
		<span class="text-sm min-w-9 text-right font-bold">{progress()}%</span>
	</div>

	<!-- Stats Row -->
	<div class="grid grid-cols-3 border border-black divide-x divide-black mb-2">
		<div class="p-2 overflow-hidden">
			<div class="text-xs tracking-widest text-gray-500 mb-1">{goal.goalType === 'debt' ? 'PAID' : 'SAVED'}</div>
			{#if debtValues()}
				<div class="font-bold text-sm text-green-700 truncate">{formatCurrencyShorthand(debtValues()!.paid)}</div>
				<div class="text-xs text-gray-500 truncate">{formatCurrency(debtValues()!.paid)}</div>
			{:else}
				<div class="font-bold text-sm text-green-700 truncate">{formatCurrencyShorthand(goal.currentAllocation)}</div>
				<div class="text-xs text-gray-500 truncate">{formatCurrency(goal.currentAllocation)}</div>
			{/if}
		</div>
		<div class="p-2 overflow-hidden">
			<div class="text-xs tracking-widest text-gray-500 mb-1">{goal.goalType === 'debt' ? 'STARTING' : 'TARGET'}</div>
			{#if debtValues()}
				<div class="font-bold text-sm truncate">{formatCurrencyShorthand(debtValues()!.starting)}</div>
				<div class="text-xs text-gray-500 truncate">{formatCurrency(debtValues()!.starting)}</div>
			{:else}
				<div class="font-bold text-sm truncate">{formatCurrencyShorthand(goal.targetAmountInCents)}</div>
				<div class="text-xs text-gray-500 truncate">{formatCurrency(goal.targetAmountInCents)}</div>
			{/if}
		</div>
		<div class="p-2 overflow-hidden">
			<div class="text-xs tracking-widest text-gray-500 mb-1">REMAINING</div>
			{#if debtValues()}
				<div class="font-bold text-sm {progressTextColor} truncate">{formatCurrencyShorthand(debtValues()!.remaining)}</div>
				<div class="text-xs text-gray-500 truncate">{formatCurrency(debtValues()!.remaining)}</div>
			{:else}
				<div class="font-bold text-sm {progressTextColor} truncate">{formatCurrencyShorthand(remaining)}</div>
				<div class="text-xs text-gray-500 truncate">{formatCurrency(remaining)}</div>
			{/if}
		</div>
	</div>

	<!-- Target Date -->
	{#if goal.targetDate}
		<div class="text-xs text-gray-600 mb-2">
			Target date: <span class="font-bold">{formatDate(new Date(goal.targetDate))}</span>
		</div>
	{/if}

	<!-- Emergency Fund Milestones -->
	{#if emergencyFundMilestones()}
		<div class="border border-black p-2 mb-2 bg-white">
			<div class="text-xs tracking-widest text-gray-500 mb-1">EMERGENCY FUND MILESTONES</div>
			<div class="flex gap-3">
				{#each emergencyFundMilestones() as milestone}
					<div class="flex items-center gap-1 text-xs">
						<span class={milestone.achieved ? 'text-green-700' : 'text-gray-400'}>
							{milestone.achieved ? '✓' : '○'}
						</span>
						<span class={milestone.achieved ? 'font-bold text-green-700' : 'text-gray-400'}>
							{milestone.label}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Debt Milestones -->
	{#if goal.goalType === 'debt' && goal.milestones && goal.milestones.length > 0}
		<div class="border border-black p-2 mb-2 bg-white">
			<div class="text-xs tracking-widest text-gray-500 mb-1">DEBT MILESTONES</div>
			<div class="flex gap-3">
				{#each goal.milestones as milestone}
					<div class="flex items-center gap-1 text-xs">
						<span class={milestone.reached ? 'text-green-700' : 'text-gray-400'}>
							{milestone.reached ? '✓' : '○'}
						</span>
						<span class={milestone.reached ? 'font-bold text-green-700' : 'text-gray-400'}>
							{milestone.label}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Actions -->
	<div class="flex gap-2 pt-2 border-t border-gray-300">
		{#if goal.goalType === 'debt'}
			<a href="/accounts/{goal.linkedAccountSlug}" class="bracket-link text-xs">View Debt Account</a>
		{:else}
			<a href="/goals/{goal.slug}/add" class="bracket-link text-xs">Add Money</a>
			<a href="/goals/{goal.slug}/withdraw" class="bracket-link text-xs">Withdraw</a>
		{/if}
		{#if showArchive}
			<a href="/goals/{goal.slug}/confirm-archive" class="bracket-link text-xs text-red-700">Archive</a>
		{/if}
	</div>
</div>
