<script lang="ts">
	let { label, value, color = '', detail }: {
		label: string;
		value: string;
		color?: string;       // e.g., 'text-green-700', 'text-red-700', 'text-amber-700'
		detail?: string;
	} = $props();
</script>

<div class="border-r border-black p-2 last:border-r-0">
	<div class="text-[10px] font-bold text-gray-600 mb-1 uppercase">{label}</div>
	<div class="text-lg font-bold {color}">{value}</div>
	{#if detail}
		<div class="text-[10px] text-gray-600 mt-1">{detail}</div>
	{/if}
</div>
