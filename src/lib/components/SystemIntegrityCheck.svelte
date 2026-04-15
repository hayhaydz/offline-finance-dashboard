<script lang="ts">
	type Check = { label: string; ok: boolean; detail?: string };
	let { checks, flags, flagColor = 'red' }: {
		checks: Check[];
		flags: string[];
		flagColor?: 'red' | 'amber';
	} = $props();

	const colorClass = $derived(flagColor === 'amber'
		? { text: 'text-amber-700', border: 'border-amber-700' }
		: { text: 'text-red-700', border: 'border-red-700' });

	const flagLabel = $derived(flagColor === 'amber' ? 'FLAGS DETECTED' : 'CRITICAL INTEGRITY ERRORS DETECTED');
</script>

<div class="border-b border-black">
	<div class="p-2 font-bold uppercase">System Integrity Check</div>
	<div class="p-2 font-mono text-[10px] space-y-1 uppercase">
		{#each checks as check}
			<div class="flex justify-between max-w-md">
				<span>{check.label}</span>
				<span class={check.ok ? 'text-green-700' : 'text-red-700 font-bold'}>
					{check.ok ? 'OK' : `FAIL${check.detail ? ' ' + check.detail : ''}`}
				</span>
			</div>
		{/each}

		{#if flags.length > 0}
			<div class="{colorClass.text} mt-2 border-l-2 {colorClass.border} pl-2 py-1">
				[!] {flagLabel}
				<ul class="list-none pl-0 mt-1 space-y-1">
					{#each flags as flag}
						<li>- {flag}</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="text-green-700 mt-2 font-bold">
				NOMINAL OPERATING STATE - ALL RECONCILED ✓
			</div>
		{/if}
	</div>
</div>
