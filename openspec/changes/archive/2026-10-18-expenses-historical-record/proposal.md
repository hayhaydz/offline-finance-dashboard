## Why

Monthly expenses are currently a single flat value in `system_metadata` (`monthly_expenses`) with no month attached and no user scoping — every edit overwrites the past. Tax income already solves this with `income_history` (one row per user per month), letting you see how a figure shifted over time. Expenses deserve the same treatment so historical shifts in spending are preserved and viewable.

## What Changes

- New `expenses_history` table (user-scoped, one row per `YYYY-MM`, amount in pence + optional note) mirroring the `income_history` pattern.
- New page `/overview/expenses` with the same year × month grid UI as `/overview/tax/income`: click-to-edit single months, remove entry (unknown ≠ £0), and range-fill with explicit overwrite confirmation.
- New server helper for "latest known monthly expenses" (most recent month ≤ current), used wherever the old flat value was displayed.
- One-time data migration: copy the existing `monthly_expenses` value into `expenses_history` for the current month, then retire the `system_metadata` key.
- **BREAKING (internal)**: the `saveMonthlyExpenses` form action and expenses form in `settings/general` are removed; the section becomes a read-only current-value display with a bracket link to `/overview/expenses`. Emergency-fund help text is updated to reference the latest known month.
- `scripts/seed.ts` updated for the new table (per repo convention).

## Capabilities

### New Capabilities
- `expenses-history-tracking`: Per-user monthly expenses history — sparse month-keyed entries (present row = known, including £0; absent = unknown), year × month grid editing, range fill with confirmation, and latest-known-value lookup.

### Modified Capabilities

(none — `income-history-tracking` and `tax-band-history` are untouched; settings general has no existing spec)

## Impact

- **DB schema**: `src/lib/db/schema/` (new table + relations + export), applied via `db:push` (active-dev phase; no migration files). `scripts/seed.ts` + `scripts/seed/modes/*` updated.
- **Routes**: new `src/routes/overview/expenses/` (+page.server.ts with `saveMonth`/`removeMonth`/`rangeFill` actions, +page.svelte grid); `src/routes/settings/general/` loses the expenses form action.
- **Migration**: small one-off script `scripts/backfill-expenses-history.ts` (mirrors `backfill-tax-bands.ts`) to seed the current month from the legacy `system_metadata` value.
- **Tests**: new vitest suite for the history query/actions module mirroring the income-history coverage pattern.
- **No consumers outside settings** currently read `monthly_expenses`, so blast radius is limited to the settings page and seed data.
