<script lang="ts">
	let { label, value, color = '', detail, detailLines, href }: {
		label: string;
		value: string;
		color?: string;       // e.g., 'text-green-700', 'text-red-700', 'text-amber-700'
		detail?: string;
		/** Multi-line detail: each entry renders on its own line. Use instead
		 *  of embedding markup in `detail` — Svelte escapes strings, so a
		 *  literal "<br>" would display as text (P1-1, 2026-10-27 audit). */
		detailLines?: string[];
		/** v3.2 (2026-11-01): optional link — the whole card becomes one
		 *  clickable area (home overview strip). Outer div keeps the grid
		 *  border logic; the anchor carries the padding + hover state. */
		href?: string;
	} = $props();
</script>

<div class="border-r border-black last:border-r-0">
	{#if href}
		<a href={href} class="block p-2 hover:bg-gray-50 transition-colors duration-150">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">{label}</div>
			<div class="text-lg font-bold {color}">{value}</div>
			{#if detail}
				<div class="text-[10px] text-gray-600 mt-1">{detail}</div>
			{/if}
			{#if detailLines && detailLines.length > 0}
				<div class="text-[10px] text-gray-600 mt-1 leading-tight">
					{#each detailLines as line}
						<div>{line}</div>
					{/each}
				</div>
			{/if}
		</a>
	{:else}
		<div class="p-2">
			<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">{label}</div>
			<div class="text-lg font-bold {color}">{value}</div>
			{#if detail}
				<div class="text-[10px] text-gray-600 mt-1">{detail}</div>
			{/if}
			{#if detailLines && detailLines.length > 0}
				<div class="text-[10px] text-gray-600 mt-1 leading-tight">
					{#each detailLines as line}
						<div>{line}</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
