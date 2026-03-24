<script lang="ts">
	import type { PageData } from './$types';
	import { formatDate } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();
</script>

<div class="p-2">
	<!-- Breadcrumb back link -->
	<div class="mb-2">
		<a href="/accounts/{data.account.slug}" class="bracket-link text-xs">
			← Back to {data.account.name}
		</a>
	</div>

	<!-- Note header -->
	<div class="border border-black p-2 mb-2">
		<div class="flex justify-between items-start gap-2 mb-2">
			<h2 class="text-base font-bold m-0">Note Details</h2>
			<div class="text-xs text-gray-500">
				{formatDate(data.note.createdAt)}
			</div>
		</div>
		<div class="text-xs text-gray-600 mb-1">
			Account: <span class="font-bold">{data.account.name}</span>
		</div>
	</div>

	<!-- Note content -->
	<div class="border border-black bg-white p-4">
		<div class="whitespace-pre-wrap text-sm font-mono">
			{data.note.content}
		</div>
	</div>
</div>
