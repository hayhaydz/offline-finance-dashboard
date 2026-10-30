<script lang="ts">
	import { listnav } from "$lib/utils/list-nav";

	/**
	 * Reports v2 index (R10): dated article list — each report is a
	 * focused question, answered on its own page in the science-paper
	 * format. Newest first; today's date heads the page like a masthead.
	 */

	let { data } = $props<{
		data: {
			reports: { slug: string; title: string; blurb: string }[];
			today: string;
		};
	}>();

	function displayDate(iso: string): string {
		return new Date(`${iso}T00:00:00.000Z`)
			.toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			})
			.toUpperCase();
	}
</script>

<!-- R-H3/R29 consistency: full-width like the papers (was max-w-6xl —
     left a 27% dead zone at 1600px) -->
<div class="p-3">
	<header class="flex justify-between items-baseline mb-1">
		<h1 class="text-lg font-bold">Reports</h1>
		<span class="text-xs text-gray-500">{displayDate(data.today)} · {data.reports.length} PIECES</span>
	</header>
	<p class="text-xs text-gray-600 mb-3">
		Each report asks one question of the data and answers it with the numbers
		and the method that produced them.
	</p>

	<!-- j/k list-nav (sweep 9): article rows are keyboard-walkable like
	     accounts/goals/snapshots; Enter opens the selected paper -->
	<div class="border border-black" use:listnav>
		{#each data.reports as report, i (report.slug)}
			<a
				href="/overview/reports/{report.slug}"
				data-nav-row
				data-nav-primary
				class="block {i > 0 ? 'border-t' : ''} border-black p-2 hover:bg-gray-50"
			>
				<div class="flex justify-between items-baseline gap-4">
					<span class="font-bold">{report.title}</span>
					<span class="text-xs text-gray-500 whitespace-nowrap">{displayDate(data.today)}</span>
				</div>
				<p class="text-xs text-gray-600 mt-1">{report.blurb}</p>
				<span class="bracket-link text-xs">Read Report</span>
			</a>
		{/each}
	</div>
</div>
