<script lang="ts">
  import {
    devLogClient,
    logErrorClient,
    logComponentLifecycle,
    logFormSubmit
  } from "$lib/utils/client-logger";
  import { tick } from 'svelte'; // Import Svelte's tick utility

  let {
    page,
    totalPages,
    onPageChange,
    scrollTarget
  }: {
    page: number;
    totalPages: number;
    // Update the type to accept an async Promise from the parent
    onPageChange: (newPage: number) => void | Promise<void>; 
    scrollTarget?: HTMLElement | null;
  } = $props();

  // Log component mount
  $effect(() => {
    logComponentLifecycle("pagination", "PaginationClient", "mount", {
      initialPage: page,
      totalPages
    });
    return () => {
      logComponentLifecycle("pagination", "PaginationClient", "unmount", {
        finalPage: page,
        totalPages
      });
    };
  });

  // Log page changes
  $effect(() => {
    devLogClient("PaginationClient", "Page changed", {
      currentPage: page,
      totalPages,
      progress: `${page + 1} of ${totalPages}`
    });
  });

  const pages = $derived.by((): (number | '...')[] => {
    const range: (number | '...')[] = [];
    let last = -1;
    for (let i = 0; i < totalPages; i++) {
      if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
        if (last !== -1 && i - last > 1) range.push('...');
        range.push(i);
        last = i;
      }
    }
    devLogClient("PaginationClient", "Pages calculated", {
      totalPages,
      currentPage: page,
      displayedPages: range,
      visibleCount: range.filter((p) => p !== '...').length
    });
    return range;
  });

  // Make the handler async so it can wait for SvelteKit routing
  async function handlePageChange(newPage: number, action: string) {
    devLogClient("PaginationClient", `Page action: ${action}`, {
      fromPage: page,
      toPage: newPage,
      totalPages,
      isValid: newPage >= 0 && newPage < totalPages
    });

    if (newPage >= 0 && newPage < totalPages) {
      await onPageChange(newPage);

      if (scrollTarget) {
        await tick();
        
        const rect = scrollTarget.getBoundingClientRect();
        const isOutOfView = rect.top < 0 || rect.bottom > window.innerHeight;
        
        if (isOutOfView) {
          scrollTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      }
    }
  }
</script>

{#if totalPages > 1}
  <div class="border-t border-black p-2 flex gap-2 items-center text-sm">
    {#if page > 0}
      <button
        type="button"
        onclick={() => handlePageChange(page - 1, "Previous")}
        class="bracket-link"
      >
        Prev
      </button>
    {/if}
    {#each pages as p}
      {#if p === '...'}
        <span class="text-gray-400">...</span>
      {:else if p === page}
        <span class="font-bold">[{p + 1}]</span>
      {:else}
        <button
          type="button"
          onclick={() => handlePageChange(p as number, `Page ${p + 1}`)}
          class="bracket-link"
        >
          {p + 1}
        </button>
      {/if}
    {/each}
    {#if page < totalPages - 1}
      <button
        type="button"
        onclick={() => handlePageChange(page + 1, "Next")}
        class="bracket-link"
      >
        Next
      </button>
    {/if}
  </div>
{/if}