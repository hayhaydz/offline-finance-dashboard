<script lang="ts">
	let { data } = $props();
</script>

<div class="max-w-[900px] mx-auto p-8">
	<header class="flex justify-between items-center border-b border-gray-300 pb-4 mb-8">
		<div>
			<h1 class="m-0">Snapshots</h1>
			<p class="mt-2 mb-0">Net worth snapshots and historical tracking</p>
		</div>
		<a href="/accounts" class="bracket-link">Back to Accounts</a>
	</header>

	<main>
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>SNAPSHOTS</span>
			</div>
			<div class="bg-gray-50 p-4 border-b border-black">
				<p class="text-gray-600 text-xs">Net worth snapshots feature coming soon...</p>
			</div>
		</section>

		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>PLANNED FEATURES</span>
			</div>
			<div class="bg-gray-50 p-4 border-b border-black">
				<ul class="list-disc pl-5 my-2">
					<li>Daily, weekly, monthly net worth snapshots</li>
					<li>Historical trends and charts</li>
					<li>Account balance over time tracking</li>
					<li>Export snapshot data</li>
				</ul>
			</div>
		</section>
	</main>
</div>
