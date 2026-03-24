<script lang="ts">
	import type { PageData } from './$types';
	import { formatDateTime } from '$lib/utils/currency';

	let { data }: { data: PageData } = $props();
</script>

<div class="p-2">
	<!-- Note header with account name and back link -->
	<div class="flex justify-between items-center mb-2">
		<h2 class="text-base font-bold m-0">
			{data.account.name}
		</h2>
		<a href="/accounts/{data.account.slug}" class="bracket-link text-xs">
			[Notes]
		</a>
	</div>

	<!-- Note container -->
	<div class="border border-black">
		<!-- Note metadata header -->
		<div class="border-b border-black bg-gray-100 p-2">
			{formatDateTime(data.note.createdAt)}
		</div>

		<!-- Note content -->
		<div class="p-4">
			<div class="whitespace-pre-wrap text-sm font-mono">
				{data.note.content}
			</div>
		</div>
	</div>
</div>
