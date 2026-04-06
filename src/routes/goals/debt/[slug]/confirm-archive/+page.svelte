<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<div class="p-4 max-w-2xl">
  <h1 class="text-xl font-bold mb-4">Archive Debt Goal</h1>

  <p class="mb-4">
    Are you sure you want to archive <strong>{data.goal.name}</strong>?
  </p>

  <form method="POST" action="/goals/debt/{data.goal.slug}?/archiveGoal">
    <input type="hidden" name="confirmed" value="true" />

    <p class="mb-4 text-sm text-gray-600">
      Type the goal name to confirm: <strong>{data.goal.name}</strong>
    </p>

    <div class="flex gap-2">
      <button type="submit" class="bracket-link text-sm text-red-700">Confirm Archive</button>
      <a href="/goals/{data.goal.slug}" class="bracket-link text-sm">Cancel</a>
    </div>
  </form>
</div>