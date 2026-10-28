<script lang="ts">
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

  // P1-8 (2026-10-27 audit): this component previously logged mount,
  // unmount, page-change and pages-calculated chatter on every page load.
  // Removed entirely — pagination state is trivially visible in the UI.

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
    return range;
  });

  // Make the handler async so it can wait for SvelteKit routing
  async function handlePageChange(newPage: number, _action: string) {
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
