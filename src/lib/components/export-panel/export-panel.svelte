<script lang="ts">
	import { TRANSACTION_TYPES } from "$lib/utils/domain-constants";

	/**
	 * R18 export selection panel — choose exactly what to export.
	 *
	 * Each account row carries its own context (type, row count, date
	 * coverage) so "which account is which or why or what" is answerable
	 * from the panel itself. The download link is composed client-side
	 * against the existing /api/transactions/export query API; the
	 * downloaded file repeats the context as self-describing header
	 * comments.
	 */

	type AccountContext = {
		id: number;
		slug: string;
		name: string;
		type: string;
		txCount: number;
		firstDate: string | null;
		lastDate: string | null;
	};

	let {
		accounts,
	}: { accounts: AccountContext[] } = $props();

	let selected = $state<Set<string>>(new Set());
	let from = $state("");
	let to = $state("");
	let type = $state("");

	const allSelected = $derived(selected.size === accounts.length);
	const selectedCount = $derived(selected.size);

	function toggle(slug: string) {
		const next = new Set(selected);
		if (next.has(slug)) {
			next.delete(slug);
		} else {
			next.add(slug);
		}
		selected = next;
	}

	function toggleAll() {
		selected = allSelected
			? new Set()
			: new Set(accounts.map((a) => a.slug));
	}

	const exportUrl = $derived.by(() => {
		const params = new URLSearchParams();
		if (selected.size > 0 && selected.size < accounts.length) {
			params.set("accounts", [...selected].join(","));
		}
		if (from) params.set("from", from);
		if (to) params.set("to", to);
		if (type) params.set("type", type);
		const query = params.toString();
		return `/api/transactions/export${query ? `?${query}` : ""}`;
	});

	const selectedRows = $derived(
		accounts
			.filter((a) => selected.size === 0 || selected.has(a.slug))
			.reduce((sum, a) => sum + a.txCount, 0),
	);
</script>

<div class="p-2 text-xs">
	<p class="text-gray-600 mb-2">
		Pick accounts (leave all unchecked for every open account), optionally narrow by
		date or type. The file's header comments repeat this context — account legend,
		row counts, scope — so it explains itself on disk.
	</p>

	<div class="border border-black mb-2 overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr class="bg-gray-100 border-b border-black">
					<th class="text-left px-1 py-0.5 w-8">
						<input
							type="checkbox"
							aria-label="Select all accounts"
							checked={allSelected}
							onchange={toggleAll}
						/>
					</th>
					<th class="text-left px-1 py-0.5">Account</th>
					<th class="text-left px-1 py-0.5">Type</th>
					<th class="text-right px-1 py-0.5">Rows</th>
					<th class="text-left px-1 py-0.5">Coverage</th>
				</tr>
			</thead>
			<tbody>
				{#each accounts as a (a.slug)}
					<tr class="border-b border-gray-200 last:border-b-0">
						<td class="px-1 py-0.5">
							<input
								type="checkbox"
								aria-label="Export {a.name}"
								checked={selected.has(a.slug)}
								onchange={() => toggle(a.slug)}
							/>
						</td>
						<td class="px-1 py-0.5">{a.name}</td>
						<td class="px-1 py-0.5 text-gray-600">{a.type}</td>
						<td class="px-1 py-0.5 text-right tabular-nums">{a.txCount}</td>
						<td class="px-1 py-0.5 text-gray-600 whitespace-nowrap">
							{#if a.firstDate && a.lastDate}{a.firstDate} &rarr; {a.lastDate}{:else}<span title="This account has no transactions yet">— none yet</span>{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="px-1 py-0.5 text-gray-500">No open accounts.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-nowrap items-center gap-2 mb-2">
		<label class="whitespace-nowrap">from <input type="date" name="exportFrom" bind:value={from} class="border border-black px-1" /></label>
		<label class="whitespace-nowrap">to <input type="date" name="exportTo" bind:value={to} class="border border-black px-1" /></label>
		<label class="whitespace-nowrap">type
			<select name="exportType" bind:value={type} class="border border-black px-1">
				<option value="">all</option>
				{#each TRANSACTION_TYPES as t (t)}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="flex items-center gap-4">
		<a href={exportUrl} download class="bracket-link">Download Export</a>
		<span class="text-gray-500">
			{selectedCount === 0
				? `all open accounts · ${selectedRows} rows`
				: `${selectedCount} account${selectedCount !== 1 ? "s" : ""} selected · ~${selectedRows} rows`}
			{type ? ` · type ${type}` : ""}
		</span>
	</div>
</div>
