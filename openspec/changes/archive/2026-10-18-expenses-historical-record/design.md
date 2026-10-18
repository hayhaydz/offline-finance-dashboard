## Context

- Monthly expenses today: one global row in `system_metadata` (`key = "monthly_expenses"`, pence string, no user scoping, no date). Written by the `saveMonthlyExpenses` action in `src/routes/settings/general/+page.server.ts`; read only by that page (emergency-fund milestone reference). No other consumer in `src/`.
- The pattern to mirror: `income_history` (`src/lib/db/schema/tax.ts`) — user-scoped, one row per `"YYYY-MM"`, pence amount, optional note, unique `(user_id, month)`. UI at `/overview/tax/income` shows a year × month grid with click-to-edit, remove (unknown ≠ £0), and range-fill with explicit overwrite confirmation. Actions live in the route's `+page.server.ts`; all queries use `withUserFilter`.
- Project phase: active dev — direct schema edits via `db:push` are preferred over migration files, but the DB is locked: `db:push` may only be run with explicit user permission.
- Repo conventions: seed script must be updated on schema change; server logging via `$lib/server/logger`; terminal aesthetic UI (monospace, black borders, bracket links, no rounded corners).

## Goals / Non-Goals

**Goals:**
- Per-user monthly expenses history with the same semantics as income history: present row = known (including £0), absent row = unknown.
- Grid UI to view and edit history; see how expenses shifted over time (per-month values, yearly known-count + total).
- Range-fill for backfilling stable periods quickly.
- Preserve the legacy single value by migrating it into the new table (current month).
- Keep a "latest known" accessor for existing display use-cases (settings summary, emergency-fund reference).

**Non-Goals:**
- Deriving expenses from transaction data (this is a manually declared figure, same as before).
- Re-touching `income_history`, tax bands, or their specs.
- Retroactive recalculation of existing Emergency Fund goals (goal targets remain set at creation time).
- Deleting the legacy `system_metadata` row (kept for rollback; merely unread).

## Decisions

1. **Table mirrors `income_history` exactly** — `expenses_history(userId, month "YYYY-MM", monthlyExpensesInCents, note, createdAt, updatedAt)`, unique index `(user_id, month)`, FK to `users`, Drizzle relations. Rationale: proven shape, identical unknown-vs-zero semantics, minimal cognitive load. Alternative (effective-dated ranges like `tax_band_history`) rejected: expenses are naturally month-keyed and the income grid already demonstrates the right UX.

2. **Calendar-year grid (Jan–Dec), not tax-year (Apr–Mar)** — expenses are a household-budgeting figure, not a tax input; AGENTS.md's tax-year rule applies to allowances/limits, which this is not. The grid structure, interactions, and styling otherwise mirror the income page 1:1.

3. **Route at `/overview/expenses`** (sibling of `/overview/tax`, not nested under it) — tax nesting exists because income feeds tax calculations; expenses don't. Header link back to `/overview`.

4. **Shared month utilities extracted** — `isValidMonth`, `monthToIndex`, `indexToMonth` move to `src/lib/utils/month-grid.ts`; the new expenses page and the income page both import them. `taxYearOfMonth` stays local to income (tax-specific). Rationale: the three helpers are currently inline in the income page server file; duplicating them a second time guarantees drift. Small, low-risk refactor.

5. **Server module `src/lib/server/expenses-history.ts`** owns data access + pure logic (testable without a route):
   - `getExpensesGrid(userId)` → rows + calendar-year grid (distinct years from rows + current year, newest first; month cells `{month, amountInCents, note}` with null = unknown).
   - `getLatestMonthlyExpenses(userId)` → most recent row with `month <= current "YYYY-MM"` (a £0 row is a valid latest value; absent → null).
   - `upsertMonth`, `removeMonth`, `rangeFill` helpers (validation, MAX_RANGE_MONTHS = 120, overwrite-confirmation data) that the route actions wrap. Route keeps auth guard + formData parsing + logger calls, mirroring the income page's structure.
   - All queries use `withUserFilter(userId, expensesHistory)` (RLS rule).

6. **Legacy migration via one-off script** — `scripts/backfill-expenses-history.ts` (pattern: `scripts/backfill-tax-bands.ts`): reads `system_metadata.monthly_expenses`, upserts that pence value into the current month for **every existing user** (the old value was global and shown to all, so all users inherit it), logs per-user results via the logger, leaves the old key in place. Idempotent (upsert), safe to re-run.

7. **Settings/general becomes read-only + link** — the section shows `getLatestMonthlyExpenses` ("Latest known: £X (2026-10)") with an `[Edit History]` bracket link to `/overview/expenses`; the `saveMonthlyExpenses` action and form are deleted. Emergency-fund help text updated to say it references the latest known month.

8. **Schema applied via `db:push`** (no migration files), gated: the task requires asking the user for explicit permission / asking them to run it — DB is locked per AGENTS.md. `scripts/seed.ts` standard mode seeds a handful of recent months so the grid demos well; edge/stress stay untouched.

## Risks / Trade-offs

- [db:push blocked without permission] → Implementation order puts schema+code first; the push step is a clearly flagged checkpoint in tasks.md, and the backfill script runs after push.
- [Global → per-user backfill is ambiguous] → Chosen: seed all users with the legacy value (it was displayed globally). Documented in the script header; rollback is trivial since we don't delete the legacy key.
- [Users must learn a new page to edit expenses] → Settings keeps a visible current-value display + bracket link; workflow cost is one click.
- [Shared util refactor touches the income page] → Helpers are pure functions moved verbatim; `npm run check` + existing tests cover the income route; `band-finder.test.ts` unaffected.
- [Sparse-entry misuse (treating missing as £0)] → Same UI copy as income ("present = known, missing = unknown — never zero by default") carried over to prevent it.

## Migration Plan

1. Add schema + code + seed updates (no behaviour change for existing pages until routes ship together).
2. Ask user to run `db:push` (or run with permission).
3. Run `scripts/backfill-expenses-history.ts` once.
4. Rollback: re-add the settings form reading/writing `system_metadata` (key preserved); drop `expenses_history` if desired. No data loss in either direction.
