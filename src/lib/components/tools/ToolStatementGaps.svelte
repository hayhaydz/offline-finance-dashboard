<script lang="ts">
	import { findMissingStatementMonths } from "$lib/utils/tool-math";

	// Statement gap finder (v3.2 harvest, 2026-11-01): D0 made visible —
	// this app sees months only when statements are declared, so the honest
	// completeness question is "which INTERIOR months of each account's own
	// range carry zero transactions". Before-first is not a gap (the
	// account may not have existed); after-last is "not yet due".

	interface GapRow {
		slug: string;
		name: string;
		type: string;
		month: string;
	}

	let { rows }: { rows: GapRow[] } = $props();

	const byAccount = $derived.by(() => {
		const map = new Map<string, { slug: string; name: string; type: string; months: string[] }>();
		for (const row of rows) {
			const entry = map.get(row.slug) ?? { slug: row.slug, name: row.name, type: row.type, months: [] };
			entry.months.push(row.month);
			map.set(row.slug, entry);
		}
		return [...map.values()]
			.map((a) => {
				const months = [...a.months].sort();
				const first = months[0] ?? "";
				const last = months[months.length - 1] ?? "";
				return {
					...a,
					first,
					last,
					missing: findMissingStatementMonths(first, last, months),
				};
			})
			.sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));
	});

	const totalMissing = $derived(byAccount.reduce((sum, a) => sum + a.missing.length, 0));
</script>

<div class="p-2 text-xs flex flex-col gap-2">
	{#if byAccount.length === 0}
		<p class="text-gray-500 text-center py-2">[no declared transactions — import statements first]</p>
	{:else}
		<p class="text-gray-600">
			{byAccount.length} accounts with declared history ·
			<span class="font-bold {totalMissing > 0 ? 'text-amber-700' : 'text-green-700'}">
				{totalMissing} interior month{totalMissing !== 1 ? 's' : ''} missing
			</span>
			· statement model: only months between each account's first and last declaration count as gaps
		</p>

		<div class="border border-black overflow-x-auto">
			<table class="w-full">
				<thead>
					<tr class="bg-gray-100 border-b border-black">
						<th class="text-left px-1 py-0.5">Account</th>
						<th class="text-right px-1 py-0.5">Declared</th>
						<th class="text-right px-1 py-0.5">Range</th>
						<th class="text-left px-1 py-0.5">Missing months</th>
					</tr>
				</thead>
				<tbody>
					{#each byAccount as acc (acc.slug)}
						<tr class="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
							<td class="px-1 py-1">
								<a href="/accounts/{acc.slug}" class="bracket-link">{acc.name}</a>
								<span class="text-gray-600"> · {acc.type}</span>
							</td>
							<td class="text-right px-1 py-1 tabular-nums">{acc.months.length}</td>
							<td class="text-right px-1 py-1 tabular-nums text-gray-600 whitespace-nowrap">{acc.first} → {acc.last}</td>
							<td class="px-1 py-1">
								{#if acc.missing.length === 0}
									<span class="text-green-700 font-bold">complete</span>
								{:else}
									<span class="flex flex-wrap gap-x-2 gap-y-0.5">
										{#each acc.missing as month (month)}
											<span class="text-amber-700 font-bold">{month}</span>
										{/each}
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="text-gray-600 text-[10px]">
			gaps are claim-free by construction: months before an account's first statement are unknown, not missing —
			and the newest month is only ever "not yet due" (statements land at month end).
		</p>
	{/if}
</div>
