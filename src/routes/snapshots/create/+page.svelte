<script lang="ts">
	import CreateSnapshotModal from '$lib/components/CreateSnapshotModal.svelte';

	let { data, form } = $props();

	function handleClose() {
		window.location.href = '/snapshots';
	}
</script>

<CreateSnapshotModal preview={data.preview} defaultDate={data.defaultDate} form={form ?? undefined} onClose={handleClose} />
