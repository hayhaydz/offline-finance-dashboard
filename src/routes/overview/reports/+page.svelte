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

	<!-- v3.2 V3: card grid — the same grammar as the tools index (user:
	     "overview -> reports should be cards/grid similar to tools"); the
	     dated masthead stays. j/k list-nav kept (sweep 9).
	     D6 (2026-11-01): 13 cards on 3 cols orphaned the newest report —
	     the LATEST entry now leads as a full-width feature card (the news-
	     article metaphor from the original ask), leaving 12 = clean 3×4. -->
	<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3" use:listnav>
		<a
			href="/overview/reports/{data.reports[data.reports.length - 1].slug}"
			data-nav-row
			data-nav-primary
			class="lg:col-span-3 md:col-span-2 border border-black p-2 hover:bg-gray-50 flex flex-col gap-1"
		>
			<span class="font-bold flex items-center gap-2">
				{data.reports[data.reports.length - 1].title}
				<span class="text-[10px] font-normal text-green-700 border border-green-700 px-1">LATEST</span>
			</span>
			<span class="text-xs text-gray-600 flex-1">{data.reports[data.reports.length - 1].blurb}</span>
			<span class="text-[10px] text-gray-500">{displayDate(data.today)}</span>
			<span class="bracket-link text-xs">Read Report</span>
		</a>
		{#each data.reports.slice(0, -1) as report (report.slug)}
			<a
				href="/overview/reports/{report.slug}"
				data-nav-row
				data-nav-primary
				class="border border-black p-2 hover:bg-gray-50 flex flex-col gap-1"
			>
				<span class="font-bold">{report.title}</span>
				<span class="text-xs text-gray-600 flex-1">{report.blurb}</span>
				<span class="text-[10px] text-gray-500">{displayDate(data.today)}</span>
				<span class="bracket-link text-xs">Read Report</span>
			</a>
		{/each}
	</div>
	<p class="text-[10px] text-gray-600 mt-2">j / k walks the grid · Enter opens the selected report · Esc clears</p>
</div>
