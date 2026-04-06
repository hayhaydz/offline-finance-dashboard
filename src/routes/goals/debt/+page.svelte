<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/goals?type=debt', { replaceState: true });
  });
</script>
<p>Redirecting to unified goals page...</p>
