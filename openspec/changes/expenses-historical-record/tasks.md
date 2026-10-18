## 1. Schema & shared utilities

- [x] 1.1 Add `expenses_history` table + relations to a new `src/lib/db/schema/expenses.ts` (userId FK, `month "YYYY-MM"`, `monthlyExpensesInCents`, `note`, timestamps, unique index `(user_id, month)`); export table, relations, and row type from `src/lib/db/schema/index.ts`
- [x] 1.2 Create `src/lib/utils/month-grid.ts` with `isValidMonth`, `monthToIndex`, `indexToMonth` (moved verbatim from the income page server file); refactor `src/routes/overview/tax/income/+page.server.ts` to import them (delete the inline copies, keep `taxYearOfMonth` local)
- [x] 1.3 Update `scripts/seed.ts` (standard mode) to seed a few recent months of expenses history for the admin user

## 2. Server module

- [x] 2.1 Create `src/lib/server/expenses-history.ts`: `getExpensesGrid(userId)` (calendar-year × month grid, newest year first, current year always present, null = unknown), `getLatestMonthlyExpenses(userId)` (most recent month ≤ current; £0 valid; null if none), `upsertMonth`, `removeMonth`, `rangeFill` (MAX_RANGE_MONTHS = 120, overwrite-confirmation payload) — all queries via `withUserFilter`, logging via `$lib/server/logger`
- [x] 2.2 Add `src/lib/server/expenses-history.test.ts` covering: zero-vs-unknown semantics, latest-known resolution (incl. future-month exclusion), range validation (order, cap, negative amount), and user scoping (mirror the setup/teardown pattern from `tax-bands.test.ts` / `band-finder.test.ts`)

## 3. Expenses history page

- [x] 3.1 Create `src/routes/overview/expenses/+page.server.ts`: load returns the grid; actions `saveMonth`, `removeMonth`, `rangeFill` wrap the server module with auth guard, formData parsing, `logFormData`/`devLog`/`logError` (mirror the income page)
- [x] 3.2 Create `src/routes/overview/expenses/+page.svelte`: calendar-year grid (Jan–Dec labels), click-to-edit panel (amount + note), remove entry, range-fill form with confirmation round-trip, per-year known-count + total — terminal aesthetic, `[Overview]` bracket link back
- [x] 3.3 Verify page against spec scenarios (zero explicit, gaps visible, single-month edit, remove → unknown, range-fill confirm, year totals)

## 4. Settings migration & backfill

- [x] 4.1 Replace the expenses form in `src/routes/settings/general/+page.svelte` with a read-only "Latest known" display (amount + month, or unknown) + `[Edit History]` link to `/overview/expenses`; update emergency-fund help text to reference the latest known month; drop now-unused form state/validation
- [x] 4.2 Remove the `saveMonthlyExpenses` action and `system_metadata` read from `src/routes/settings/general/+page.server.ts`; load `latestExpenses` via `getLatestMonthlyExpenses` instead
- [x] 4.3 Create `scripts/backfill-expenses-history.ts` (pattern: `backfill-tax-bands.ts`): read legacy `monthly_expenses`, upsert current-month row for every existing user, idempotent, no-op cleanly when the key is absent; keep the legacy key in place

## 5. Verification & release

- [x] 5.1 Run `npm run check` and `npm test`; fix any failures
- [x] 5.2 **Checkpoint — ask user**: get explicit permission to run `npm run db:push` (DB is locked), then run it (or have the user run it)
- [x] 5.3 After push: run `npx tsx scripts/backfill-expenses-history.ts` once and confirm the legacy value landed in the current month
- [x] 5.4 Spot-check in browser: `/overview/expenses` grid + edit flows, `/settings/general` summary + link; confirm old `saveMonthlyExpenses` form is gone
- [x] 5.5 Update `.docs/VERSION_HISTORY.md` with a one-line save-point entry
