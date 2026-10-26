<script lang="ts">
  import type { PageData } from './$types';

  // The form posts to the debt detail route's `archiveGoal` action (this page
  // has no actions of its own), so type the shape we render rather than ActionData.
  let { data, form }: { data: PageData; form: { error?: string } | null } = $props();

  let nameInput = $state('');
  const confirmed = $derived(nameInput === data.goal.name);
</script>

<div class="p-4 max-w-2xl">
  <h1 class="text-xl font-bold mb-4">Archive Debt Goal</h1>

  <p class="mb-4">
    Are you sure you want to archive <strong>{data.goal.name}</strong>?
  </p>

  {#if form?.error}
    <div class="bg-red-100 border border-black p-2 mb-4 text-sm text-red-900">
      <span class="font-bold">ERROR:</span> {form.error}
    </div>
  {/if}

  <form method="POST" action="/goals/debt/{data.goal.slug}?/archiveGoal">
    <p class="mb-2 text-sm text-gray-600">
      Type <strong>{data.goal.name}</strong> to confirm:
    </p>

    <div class="mb-4">
      <input
        type="text"
        name="confirmName"
        bind:value={nameInput}
        autocomplete="off"
        class="border border-black p-1 text-sm font-mono w-full"
      />
    </div>

    <div class="flex gap-2">
      <button
        type="submit"
        disabled={!confirmed}
        class="bracket-link text-sm text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Confirm Archive
      </button>
      <a href="/goals/{data.goal.slug}" class="bracket-link text-sm">Cancel</a>
    </div>
  </form>
</div>
