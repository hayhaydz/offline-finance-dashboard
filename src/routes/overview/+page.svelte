<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/overview/snapshots');
	});
</script>

<div class="p-4">
	<p>Redirecting to Snapshots...</p>
</div>
