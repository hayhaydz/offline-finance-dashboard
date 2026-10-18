## Context

Budgets live at `/overview/budgets`. Category/account include-exclude filters exist (`budgets/[month]/+page.svelte:257-290`) but none of the page's forms render feedback (audit #5), there is no transaction-type filter, and new budgets silently include every account. Note 05. Depends on `transaction-taxonomy` for the spending-rules definition.

## Goals / Non-Goals

**Goals:**
- All budgets forms render validation errors + success feedback
- Type include/exclude filter per budget (consumes the taxonomy's spending rules)
- New budgets get a scoping step; existing budgets keep behaviour with the account panel

**Non-Goals:**
- Fixing the session/logout behaviour itself (`session-timer-reliability`) — only the acceptance re-test lives here
- Changing spending definitions (owned by `transaction-taxonomy`)
- Budget templates/copying months

## Decisions

1. **Shared submit-feedback pattern** — reuse the existing `use-submit-feedback.svelte.ts` composable (touched in `2edb12d`) across all six budgets forms rather than bespoke per-form state; consistent copy (`Saved` / first validation error).
2. **Type filter storage** — JSON column on the existing budget-month config row (`excludedTypes: TransactionType[]`), mirroring `excludedCategoryIds`/excluded accounts already there; queries combine type exclusion with the spending-rules definition from taxonomy.
3. **Scoping step for new budgets** — the budget creation flow gains an account multi-select (defaults to none selected + "all accounts" explicit toggle). Existing months untouched: their config simply has no stored exclusions = all accounts, which is today's behaviour.
4. **Filter panel footnote** — the discoverable spending definition (from taxonomy spec) renders inside the filter panel.
5. **Versioned config storage from day one (user decision: edit trails)** — a `budget_config_amendments` child table (`budgetMonthId, field, oldValue (JSON), newValue (JSON), note nullable, createdAt`) records every config mutation automatically; no forced reason, note optional. The `excludedTypes` column from decision 2 writes through the same trail — bolting versioning on later would mean redoing storage, so it's designed together.
6. **Retroactive edits are corrections by default** — any month's config is editable via its own page (rows are already independent per-month copies); each edit trails old→new. Transactions are never touched by config edits — spend facts are immutable (corrections go through the CSV reimport's backup-gated path).
7. **Forward-apply affordance** — config edit forms offer `[x] apply from this month onward` (writes current + all future month rows, each trailed as an amendment) vs `this month only` (default). This removes the pressure to rewrite history when the real intent is "change it going forward".
8. **Amendment visibility (user decision: month + year)** — month page: inline `[amended <date> — was X]` markers next to changed values + expandable amendment list. Budgets index: a year-level amendment timeline (reverse-chronological across months, latest-first, expandable).

## Risks / Trade-offs

- [JSON column untyped at DB level] → validated against `TRANSACTION_TYPES` on read/write; acceptable under direct-push phase.
- [Scope creep into taxonomy] → this change consumes but never redefines spending rules; dependency ordering enforced in tasks.

## Migration Plan

Additive config fields via `db:push`; forms updated in place. Rollback = revert.
