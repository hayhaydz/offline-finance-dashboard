<script lang="ts">
	let { data } = $props();
	export const ssr = false;
</script>

<div class="border-b border-black p-2">
	<h1 class="text-lg font-bold mb-2 mt-0">ACCOUNTS</h1>
</div>

<!-- NET WORTH SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>NET WORTH</span>
	<span class="text-green-700 font-bold">$0.00</span>
</div>
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1">
		<span>Assets</span>
		<span class="text-green-700 font-bold">$0.00</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Liabilities</span>
		<span class="text-red-700 font-bold">$0.00</span>
	</div>
</div>

<!-- SUMMARY SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>SUMMARY</span>
</div>
<div class="border-b border-black p-2">
	<div class="flex justify-between my-1">
		<span>Total Accounts</span>
		<span>0</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Asset Accounts</span>
		<span>0</span>
	</div>
	<div class="flex justify-between my-1">
		<span>Liability Accounts</span>
	<span>0</span>
	</div>
</div>

<!-- ACCOUNTS OVERVIEW SECTION -->
<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
	<span>ACCOUNTS OVERVIEW</span>
</div>
<div class="p-2">
	<p class="text-gray-600 text-xs mb-2">No accounts yet. Add your first account to start tracking.</p>
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Type</th>
				<th class="text-right">Balance</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td colspan="3" class="text-center text-gray-600 text-xs">No accounts found</td>
			</tr>
		</tbody>
	</table>
</div>
