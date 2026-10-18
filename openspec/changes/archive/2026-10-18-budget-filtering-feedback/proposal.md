## Why

The budgets page (`.docs/notes/2026-10-18/` note 05, source 2026-10-16) was "full of transactions that weren't related to the budget", offered no transaction-type filtering, and clicks on filter toggles "did nothing or instantly logged me out". Verified at HEAD: category/account include-exclude filters exist but give no feedback on failure (audit backlog #5: none of the budgets forms render errors or success), there is no type filter, and every account is included by default.

## What Changes

- **Form feedback for all budget forms** (audit #5): the 6 budgets-page forms (include/exclude category, include/exclude account, set target, edit target, month config) render validation errors and success confirmation; posts that fail are visibly distinguishable from no-ops.
- **Transaction-type filter**: budgets gain a type dimension in the filter panel (e.g. exclude `payment`-typed rows) — consuming the spending-rules definition from the `transaction-taxonomy` change (dependency: that decision lands first).
- **Budget scoping**: new budgets default to a scoping step ("which accounts does this budget cover?") rather than silently including everything; existing budgets keep their current behaviour with the account panel as the editor.
- **Logout-on-click**: not directly a budgets bug — tracked by `session-timer-reliability`; re-verified here only as an acceptance condition ("filter interactions never silently navigate away").

- **Retroactive config revision with an amendment trail (user decisions, 2026-10-18)**: past-month budget config (targets, included categories/accounts/types) is editable retroactively — transactions are immutable facts, config is intent. Every config change is trailed automatically (field, old → new, timestamp; optional note, never forced). Config edits offer "apply from this month onward" so forward changes never require touching history. Amendments show as inline markers + expandable list on the month page, plus a year-level amendment timeline on the budgets index.

## Capabilities

### New Capabilities

- `budget-form-feedback`: Every budgets-page form renders inline validation errors and success feedback; failed posts are never visually identical to successful ones
- `budget-type-filter`: Budgets can include/exclude transaction types from spending calculations, using the taxonomy's spending-rules definition, persisted per budget month
- `budget-config-revision`: Retroactive budget config editing with an automatic amendment trail, forward-apply affordance, and month + year-level amendment visibility — transactions remain immutable

### Modified Capabilities

(none)

## Impact

- **Files**: `src/routes/overview/budgets/[month]/+page.svelte` + `+page.server.ts`, `src/routes/overview/budgets/*`, `src/lib/server/budgets.ts` (type dimension in spend queries + config), `src/lib/types/budget.ts`
- **Schema**: budget month config gains a type-exclusion list (JSON column or child table — design decides; existing `db:push` workflow)
- **Dependencies**: `transaction-taxonomy` (spending-rules decision) must be applied first
