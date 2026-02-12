<script lang="ts">
  import { enhance } from "$app/forms";

  interface Account {
    id: number;
    name: string;
    type: string;
    category: "asset" | "liability";
    excludedFromNetWorth: boolean;
    taxWrapper: string;
  }

  interface Props {
    open: boolean;
    onClose: () => void;
    accounts: Account[];
  }

  let { open, onClose, accounts }: Props = $props();

  // Account type labels
  const typeLabels: Record<string, string> = {
    current: "Current",
    savings: "Savings",
    investment: "Investments",
    "credit-card": "Credit cards",
    loan: "Personal loans",
    mortgage: "Mortgages",
  };

  // Group accounts by type and determine if type is excluded
  const accountTypes = $derived.by(() => {
    const typeMap = new Map<
      string,
      { count: number; excluded: boolean; category: "asset" | "liability" }
    >();

    for (const account of accounts) {
      const existing = typeMap.get(account.type);
      if (existing) {
        existing.count++;
        // Type is excluded if ALL accounts of this type are excluded
        if (!account.excludedFromNetWorth) {
          existing.excluded = false;
        }
      } else {
        typeMap.set(account.type, {
          count: 1,
          excluded: account.excludedFromNetWorth,
          category: account.category,
        });
      }
    }

    return typeMap;
  });

  // Track checkbox states by type (not individual accounts)
  let checkboxStates = $state<Map<string, boolean>>(new Map());
  // Track original states to detect changes
  let originalStates = $state<Map<string, boolean>>(new Map());

  // Initialize states when modal opens
  $effect(() => {
    if (open) {
      const states = new Map<string, boolean>();
      for (const [type, data] of accountTypes) {
        states.set(type, data.excluded);
      }
      checkboxStates = new Map(states);
      originalStates = new Map(states);
    }
  });

  // Check if any state has changed from original
  const hasChanges = $derived.by(() => {
    for (const [type, excluded] of checkboxStates.entries()) {
      const original = originalStates.get(type) ?? false;
      if (excluded !== original) return true;
    }
    // Also check if any original type is missing from current
    for (const [type, original] of originalStates.entries()) {
      const current = checkboxStates.get(type) ?? false;
      if (original !== current) return true;
    }
    return false;
  });

  // Handle keyboard (Escape to close)
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      onClose();
    }
  }

  // Handle backdrop click
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target === e.currentTarget) {
        onClose();
      }
    }
  }

  // Toggle type state
  function toggleType(type: string) {
    const currentState = checkboxStates.get(type) ?? false;
    checkboxStates = new Map(checkboxStates).set(type, !currentState);
  }

  function handleTypeKeydown(e: KeyboardEvent, type: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleType(type);
    }
  }

  // Get types by category
  const assetTypes = $derived(
    Array.from(accountTypes.entries()).filter(
      ([_, data]) => data.category === "asset",
    ),
  );

  const liabilityTypes = $derived(
    Array.from(accountTypes.entries()).filter(
      ([_, data]) => data.category === "liability",
    ),
  );

  // Button class helper
  const saveButtonClass = $derived(
    `border px-3 py-0.5 font-terminal text-sm ${
      hasChanges
        ? "bg-black text-white hover:bg-white hover:text-black cursor-pointer"
        : "bg-gray-400 text-gray-600 cursor-not-allowed"
    }`,
  );

  // Handle form success
  function handleFormSuccess() {
    onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Modal overlay -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onclick={handleBackdropClick}
    onkeydown={handleBackdropKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div
      class="bg-white border-2 border-black mx-4 shadow-[8px_8px_0_rgba(0,0,0,0.2)]"
      style="width: 380px; max-width: 380px;"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <!-- Title bar -->
      <div
        class="bg-black text-white px-2 py-0.5 flex justify-between items-center text-xs font-bold"
      >
        <span id="modal-title">NET WORTH SETTINGS</span>
        <button
          type="button"
          class="bg-black text-white border-none p-0 hover:bg-white hover:text-black"
          onclick={onClose}
          aria-label="Close modal"
        >
          [X]
        </button>
      </div>

      <!-- Content -->
      <div class="p-2">
        <!-- Helper note -->
        <div class="text-xs text-gray-600 mb-2">
          Choose which account types to include in net worth.<br />
          <strong>[X]</strong> = Excluded from calculation
        </div>

        <!-- Assets section -->
        <div class="border border-black px-2 py-1 mb-2">
          <div class="font-bold text-xs uppercase mb-1">Assets</div>
          {#each assetTypes as [type, data]}
            {@const isExcluded = checkboxStates.get(type) ?? false}
            <div
              class="flex justify-between items-center my-1 cursor-pointer hover:bg-gray-100"
              onclick={() => toggleType(type)}
              onkeydown={(e) => handleTypeKeydown(e, type)}
              role="button"
              tabindex="0"
            >
              <div class:text-gray-600={isExcluded}>
                <span class="font-bold">{isExcluded ? "[X]" : "[ ]"}</span>
                <span>{typeLabels[type] || type}</span>
              </div>
              <span class="text-gray-600">{data.count}</span>
            </div>
          {/each}
        </div>

        <!-- Liabilities section -->
        <div class="border border-black px-2 py-1 mb-2">
          <div class="font-bold text-xs uppercase mb-1">Liabilities</div>
          {#each liabilityTypes as [type, data]}
            {@const isExcluded = checkboxStates.get(type) ?? false}
            <div
              class="flex justify-between items-center my-1 cursor-pointer hover:bg-gray-100"
              onclick={() => toggleType(type)}
              onkeydown={(e) => handleTypeKeydown(e, type)}
              role="button"
              tabindex="0"
            >
              <div class:text-gray-600={isExcluded}>
                <span class="font-bold">{isExcluded ? "[X]" : "[ ]"}</span>
                <span>{typeLabels[type] || type}</span>
              </div>
              <span class="text-gray-600">{data.count}</span>
            </div>
          {/each}
        </div>

        <!-- Footer note -->
        <div
          class="text-xs text-gray-600 mt-2 pt-2 border-t border-dotted border-gray-400"
        >
          Excluded accounts are ignored in net worth but still shown in Accounts
          section.
        </div>
      </div>

      <!-- Footer with save/cancel -->
      <div
        class="flex justify-between px-2 py-2 bg-gray-100 border-t border-black"
      >
        <form
          action="?/updateExclusions"
          method="POST"
          onsubmit={() => {
            console.log(
              "[ExclusionsModal] Submitting checkbox states:",
              Object.fromEntries(checkboxStates.entries()),
            );
          }}
          use:enhance={() => {
            return async ({ result, update }) => {
              if (result.type === "success") {
                console.log(
                  "[ExclusionsModal] Form success, updating page data",
                );
                await update();
                console.log(
                  "[ExclusionsModal] Page data updated, closing modal",
                );
                handleFormSuccess();
              }
            };
          }}
        >
          <!-- Hidden inputs for type-level exclusion states -->
          {#each Array.from(checkboxStates.entries()) as [type, excluded]}
            <input
              type="hidden"
              name="type_{type}"
              value={excluded ? "1" : "0"}
            />
          {/each}
          <button type="submit" disabled={!hasChanges} class={saveButtonClass}>
            Save Changes
          </button>
        </form>
        <button
          type="button"
          class="bg-white border border-black px-3 py-0.5 font-terminal text-sm hover:bg-black hover:text-white"
          onclick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
