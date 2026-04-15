<script lang="ts">
	import { formatCurrency } from '$lib/utils/currency';
	import { useUrlPagination } from '$lib/utils/use-url-pagination.svelte';
	import PaginationClient from '$lib/components/PaginationClient.svelte';

	let { data } = $props();

	let tableRef = $state<HTMLElement | null>(null);

	const pagination = useUrlPagination('page');

	// Sync from server data (initial + navigation)
	$effect(() => {
		pagination.page = data.pagination.page;
	});

	function getMonthLabel(monthStr: string): string {
		const [y, m] = monthStr.split("-");
		const date = new Date(Number(y), Number(m) - 1);
		return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
	}

	function getStatusLabel(target: number, actual: number): { label: string; class: string } {
		if (target === 0) return { label: "—", class: "text-gray-400" };
		const pct = Math.round((actual / target) * 100);
		if (pct > 100) return { label: `OVER +${pct - 100}%`, class: "text-red-700 font-bold" };
		if (pct >= 95) return { label: `UNDER -${100 - pct}%`, class: "text-amber-600 font-bold" };
		return { label: `UNDER -${100 - pct}%`, class: "text-green-700 font-bold" };
	}
</script>

<div class="bg-gray-100 p-2 font-bold border-b border-black flex justify-between items-center">
	<span>BUDGET HISTORY</span>
	<a href="/overview/budgets" class="bracket-link text-xs">[Current Month]</a>
</div>

{#if data.months.length === 0}
	<div class="p-2 text-gray-600 text-sm">No budget history found.</div>
{:else}
	<div bind:this={tableRef}>
		<div class="overflow-x-auto">
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
					{#each data.months as h (h.month)}
						{@const status = getStatusLabel(h.totalTarget, h.actualSpent)}
						<tr class="border-b border-dotted border-gray-200">
							<td class="p-0.5"><a href="/overview/budgets/{h.month}" class="bracket-link">{getMonthLabel(h.month)}</a></td>
							<td class="p-0.5 text-right">{formatCurrency(h.totalTarget)}</td>
							<td class="p-0.5 text-right">{formatCurrency(h.actualSpent)}</td>
							<td class="p-0.5 text-right {status.class}">{status.label}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<PaginationClient
			page={pagination.page}
			totalPages={data.pagination.totalPages}
			onPageChange={pagination.updatePage}
			scrollTarget={tableRef}
		/>
	</div>
{/if}
