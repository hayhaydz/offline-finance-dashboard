<script lang="ts">
	import ProgressBarVariants from '$lib/components/ProgressBarVariants.svelte';
	import { browser } from '$app/environment';

	// Sample goal data for different progress levels
	const samples = [
		{ name: 'Emergency Fund', progress: 5, current: 2000, target: 40000 },
		{ name: 'House Deposit', progress: 45, current: 22500, target: 50000 },
		{ name: 'Holiday Fund', progress: 82, current: 2460, target: 3000 },
		{ name: 'New Car', progress: 23, current: 2300, target: 10000 }
	];

	let selectedSample = $state(samples[0]);
</script>

<svelte:head>
	<title>Progress Bar Variants - Demo</title>
</svelte:head>

<div class="max-w-4xl mx-auto">
	<!-- Header -->
	<div class="bg-black text-white p-1 font-bold text-xs flex justify-between">
		<span>PROGRESS-BAR-DEMO.exe</span>
		<span>MODE: PREVIEW</span>
	</div>

	<!-- Title -->
	<div class="border-b border-black p-2">
		<h1 class="text-lg font-bold mb-1 mt-0">PROGRESS BAR VARIANTS</h1>
		<p class="text-gray-600 text-sm my-1">
			6 different progress bar designs aligned with terminal aesthetic. Choose your favorite.
		</p>
	</div>

	<!-- Sample Selector -->
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
		<span>TEST WITH DIFFERENT GOALS</span>
	</div>
	<div class="p-2 border-b border-black">
		<div class="flex gap-2 flex-wrap">
			{#each samples as sample}
				<button
					class="bracket-link text-xs"
					class:bg-black={selectedSample?.name === sample.name}
					class:text-white={selectedSample?.name === sample.name}
					onclick={() => selectedSample = sample}
				>
					[{sample.name}] ({sample.progress}%)
				</button>
			{/each}
		</div>
	</div>

	<!-- Progress Bar Variants -->
	<ProgressBarVariants
		progress={selectedSample.progress}
		goalName={selectedSample.name}
		current={selectedSample.current}
		target={selectedSample.target}
	/>

	<!-- Instructions -->
	<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2 mt-4">
		<span>IMPLEMENTATION NOTES</span>
	</div>
	<div class="p-2 border-b border-black text-sm">
		<p class="mb-2">Each variant uses a different approach:</p>
		<ul class="list-none pl-0 space-y-1 text-sm">
			<li><strong class="text-green-700">V1:</strong> Plain HTML div with inline style (simplest)</li>
			<li><strong class="text-amber-700">V2:</strong> Unicode block chars (█░) with color classes</li>
			<li><strong class="text-red-700">V3:</strong> Shade chars (▓░) - more subtle</li>
			<li><strong>V4:</strong> Dot matrix (█·) - clean look</li>
			<li><strong>V5:</strong> Segmented battery style (━━)</li>
			<li><strong>V6:</strong> Dense fill with 25 segments</li>
		</ul>
		<p class="mt-2 text-gray-600 text-xs">Use the slider below the variants to test any percentage.</p>
	</div>
</div>
