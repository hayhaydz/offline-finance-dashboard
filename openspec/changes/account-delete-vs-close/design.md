## Context

`accounts.closedAt` is the soft-delete (`schema/accounts.ts:39`); accounts index sorts by `createdAt` only. User decision: build a **separate destructive delete** distinct from close, plus closed-account placement. Note 11 + audit #10 (close-account failures render nowhere).

## Goals / Non-Goals

**Goals:**
- `deletedAt` distinct from `closedAt`; hard delete for **empty accounts only** (zero transactions — mistaken creations), with close-instead guidance for anything with history
- Closed accounts collapse behind `[Show N closed]` below open accounts per type section
- Closed accounts remain in tax/interest history breakdowns

**Non-Goals:**
- Deleting accounts that have any transaction history (close them instead — user decision 2026-10-18)
- Bulk delete; undo of the destructive delete
- Changing close semantics (close keeps history — unchanged)

## Decisions

1. **`deletedAt` hard marker, `closedAt` untouched semantically** — all "not deleted" queries migrate from `closedAt IS NULL` to `deletedAt IS NULL` where they mean *existence* (vs *openness*). Close keeps its current meaning everywhere (openness, placement, history inclusion).
2. **Empty-only gate (user decision)** — the delete action and affordance require `transactionCount === 0`, checked server-side at action time (not just UI-hidden). Accounts with history see "close instead" guidance in place of the delete affordance. This eliminates the cascade problem: nothing financial depends on an empty account. Defensive allocation check remains (zero transactions should imply zero allocatable balance, but the guard is cheap insurance).
3. **What the delete removes** — account row (sets `deletedAt` or hard row delete: **hard row delete** is fine and simplest for empty accounts; notes and rate-history rows go with it, disclosed on the confirmation page). One DB transaction.
4. **Confirmation page pattern** — matches existing delete confirmations: dedicated page disclosing account name, note count, rate-history presence; no native `confirm()` dialogs.
5. **Placement** — per type section: open accounts first (existing order), then a single collapsed `[Show N closed]` toggle row revealing closed accounts (persisted toggle state in localStorage). Separate page rejected.
6. **History integrity rule** — interest/ISA/tax-year queries filter on `deletedAt IS NULL` but deliberately **not** on `closedAt` — closed accounts' history still counts; this is asserted by test. (Moot for deleted accounts by the empty-only gate, the filter keeps semantics honest for future data.)

## Risks / Trade-offs

- [Users expect delete to work on accounts with history] → UI states why ("accounts with transaction history can only be closed") with a close link; the gate is server-enforced.
- [Missed `closedAt`-means-existence call sites cause ghost accounts] → tasks include a sweep for `closedAt IS NULL` semantics with a test matrix per query family.

## Migration Plan

`db:push` adds nullable `deletedAt` (all existing rows = not deleted). Seed update same task. Rollback: drop column; empty-account deletes are not reversible by rollback (by design).
