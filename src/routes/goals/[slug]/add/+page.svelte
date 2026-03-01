<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCurrency } from '$lib/utils/currency';
	import type { ActionData, PageData } from './$types';

	type AllocationRow = {
		accountId: number;
		name: string;
		availableCents: number;
		open: boolean;
		amountPounds: number;
	};

	let { data, form } = $props<{
		data: PageData;
		form: ActionData;
	}>();

	let rows = $state<AllocationRow[]>([]);
	let initialized = false;

	$effect(() => {
		if (initialized) return;
		rows = data.accounts.map((account: PageData['accounts'][number], index: number) => ({
			accountId: account.id,
			name: account.name,
			availableCents: account.unallocated,
			open: index === 0,
			amountPounds: 0,
		}));
		initialized = true;
	});

	function maxPounds(row: AllocationRow): number {
		return Math.floor(row.availableCents / 100);
	}

	function setRowAmount(accountId: number, nextPounds: number) {
		rows = rows.map((row) => {
			if (row.accountId !== accountId) return row;
			const clamped = Math.max(0, Math.min(maxPounds(row), nextPounds));
			return { ...row, amountPounds: clamped };
		});
	}

	function onRowAmountInput(accountId: number, value: string) {
		const digits = value.replace(/[^\d]/g, '');
		const nextPounds = digits ? parseInt(digits, 10) : 0;
		setRowAmount(accountId, nextPounds);
	}

	function toggleOpen(accountId: number) {
		rows = rows.map((row) =>
			row.accountId === accountId ? { ...row, open: !row.open } : row,
		);
	}

	function appliedRowAmountCents(row: AllocationRow): number {
		return Math.min(row.availableCents, row.amountPounds * 100);
	}

	const previewRows = $derived.by(() =>
		rows
			.map((row) => ({
				accountId: row.accountId,
				name: row.name,
				amountCents: appliedRowAmountCents(row),
			}))
			.filter((row) => row.amountCents > 0),
	);

	const totalAddingCents = $derived.by(() =>
		previewRows.reduce((sum, row) => sum + row.amountCents, 0),
	);

	const goalNewBalance = $derived.by(() => data.goal.currentAllocation + totalAddingCents);
	const currentProgress = $derived.by(() =>
		data.goal.targetAmountInCents > 0
			? (data.goal.currentAllocation / data.goal.targetAmountInCents) * 100
			: 0,
	);
	const newProgress = $derived.by(() =>
		data.goal.targetAmountInCents > 0 ? (goalNewBalance / data.goal.targetAmountInCents) * 100 : 0,
	);

	const rowsJson = $derived.by(() =>
		JSON.stringify(
			rows.map((row) => ({
				accountId: row.accountId,
				selected: row.amountPounds > 0,
				amountInCents: row.amountPounds * 100,
			})),
		),
	);
</script>

<form method="POST" use:enhance>
	{#if form?.error}
		<div class="bg-red-100 border border-black p-2 mb-2 text-sm text-red-900">
			<span class="font-bold">ERROR:</span> {form.error}
		</div>
	{/if}

	<input type="hidden" name="rows_json" value={rowsJson} />

	<div class="divide-y divide-black">
		{#each rows as row (row.accountId)}
			<div>
				<button
					type="button"
					class="w-full bg-white border-none p-2 flex items-center gap-2 text-left hover:bg-gray-100"
					onclick={() => toggleOpen(row.accountId)}
				>
					<span>{row.open ? '[-]' : '[+]'}</span>
					<span class="flex-1 min-w-0">
						{row.name}
						<span class="text-xs text-gray-600"> {formatCurrency(row.availableCents)} available</span>
					</span>
					<span class="text-right text-sm">+{formatCurrency(appliedRowAmountCents(row))}</span>
					<span>{row.amountPounds > 0 ? '[x]' : '[ ]'}</span>
				</button>

				{#if row.open}
					<div class="p-2 border-t border-dotted border-gray-500 bg-white">
						<div class="flex items-end gap-2 mb-2 flex-wrap">
							<div class="flex flex-col gap-1">
								<label class="text-xs text-gray-600" for={"row-amount-" + row.accountId}>Amount</label>
								<input
									id={"row-amount-" + row.accountId}
									type="text"
									class="border border-black p-1 text-sm font-mono w-36 focus:outline-none"
									value={row.amountPounds}
									oninput={(e) =>
										onRowAmountInput(
												row.accountId,
												(e.currentTarget as HTMLInputElement).value,
											)}
								/>
							</div>
						</div>

						<div class="flex items-center gap-2 mb-2 flex-wrap">
							<button
								type="button"
								class="bracket-link"
								onclick={() => setRowAmount(row.accountId, row.amountPounds - 100)}
							>
								-
							</button>
							<div class="slider-shell">
								<input
									type="range"
									class="terminal-slider"
									min="0"
									max={maxPounds(row)}
									step="100"
									value={row.amountPounds}
									style={`--fill: ${maxPounds(row) > 0 ? ((row.amountPounds / maxPounds(row)) * 100).toFixed(1) : 0}%`}
									oninput={(e) =>
										setRowAmount(
											row.accountId,
											parseInt((e.currentTarget as HTMLInputElement).value, 10),
										)}
								/>
							</div>
							<button
								type="button"
								class="bracket-link"
								onclick={() => setRowAmount(row.accountId, row.amountPounds + 100)}
							>
								+
							</button>
						</div>

						<div class="flex gap-2 flex-wrap">
							<button type="button" class="bracket-link" onclick={() => setRowAmount(row.accountId, 0)}>£0</button>
							<button type="button" class="bracket-link" onclick={() => setRowAmount(row.accountId, 100)}>£100</button>
							<button type="button" class="bracket-link" onclick={() => setRowAmount(row.accountId, 300)}>£300</button>
							<button type="button" class="bracket-link" onclick={() => setRowAmount(row.accountId, 500)}>£500</button>
							<button type="button" class="bracket-link" onclick={() => setRowAmount(row.accountId, maxPounds(row))}>Max</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="bg-gray-100 p-2 border-t border-black">
		<div class="flex justify-between text-xs mb-1"><span>Goal</span><span>{data.goal.name}</span></div>
		<div class="flex justify-between text-xs mb-1"><span>Selected Accounts</span><span>{previewRows.length}</span></div>
		<div class="flex justify-between text-xs mb-1">
			<span>Goal Balance</span>
			<span>{formatCurrency(goalNewBalance)} (was {formatCurrency(data.goal.currentAllocation)})</span>
		</div>
		<div class="flex justify-between text-xs mb-1">
			<span>Progress</span>
			<span>{newProgress.toFixed(1).replace('.0', '')}% (was {currentProgress.toFixed(1).replace('.0', '')}%)</span>
		</div>

		<div class="border-t border-dotted border-gray-500 mt-2 pt-2">
			<div class="text-xs font-bold mb-1">Breakdown</div>
			{#if previewRows.length > 0}
				{#each previewRows as row (row.accountId)}
					<div class="flex justify-between text-xs mb-1">
						<span>{row.name}</span>
						<span class="text-green-700">+{formatCurrency(row.amountCents)}</span>
					</div>
				{/each}
			{:else}
				<div class="text-xs text-gray-600">No selected accounts with amount</div>
			{/if}
			<div class="flex justify-between text-xs pt-1 mt-1 border-t border-dotted border-gray-500">
				<strong>Total Adding</strong>
				<strong class="text-green-700">+{formatCurrency(totalAddingCents)}</strong>
			</div>
		</div>
	</div>

	<div class="p-2 border-t border-black">
		<button type="submit" class="bracket-link text-sm" disabled={totalAddingCents <= 0}>
			Confirm Add {formatCurrency(totalAddingCents)}
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
			linear-gradient(to right, #efefef 0%, #efefef var(--fill, 0%), #fff var(--fill, 0%), #fff 100%),
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
