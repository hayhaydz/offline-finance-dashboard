<script lang="ts">
	import ChartPanel from "$lib/components/charts/ChartPanel.svelte";

	let { summary = "Net worth fell £1,056 over 4 snapshots" }: { summary?: string } =
		$props();
</script>

<ChartPanel title="Net worth over time" {summary}>
	<svg aria-label="stub chart" width="10" height="10"></svg>
</ChartPanel>
