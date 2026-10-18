## Context

`src/routes/accounts/[slug]/+page.server.ts:77` paginates the ledger at a fixed 20 rows then groups by month for display — months split across pages and per-month totals are computed from partial slices. Notes 03 (sources 2026-05-08/05-17/10-14): never split a month, make pagination "waaay longer", month-at-a-time view, and sync the monthly summary with the ledger.

## Goals / Non-Goals

**Goals:**
- Ledger page = exactly one month (`?month=YYYY-MM`)
- Per-month totals computed server-side from complete month data (always truthful)
- Prev/next skip empty months; jump-to-month select; monthly summary strip is the navigation
- Old `?page=N` URLs land somewhere sane

**Non-Goals:**
- Changing other paginated pages (interest history, notes, snapshots keep `?page=`)
- Infinite scroll or page-size preferences
- The alerts `ledger-query-prefilters` change (coordinates via the same `month` param name — see `alerts-deep-links`)

## Decisions

1. **`?month=YYYY-MM` as the single param** — one page = one calendar month (UTC, matching `transaction-grouping.ts`). This makes month-splitting impossible by construction and answers "too short" (a full month is a page).
2. **Server computes month boundaries** — query `transactionDate >= start AND < end` for rows and totals; no offset math. Month totals come from the same single range query, so headers and rows can never disagree.
3. **Prev/next with data** — one extra query returns the list of months having ≥1 transaction (already effectively available via the monthly balances the page loads); prev/next jump between consecutive entries; a `<select>` of those months is the jump affordance.
4. **Summary strip = navigation** — the monthly balance summary already rendered by the page becomes clickable: selecting a month there sets the same `?month=` param (one source of truth for both views).
5. **`?page=N` redirect** — 301 to `?month=` of the month containing that offset's first row is overkill; instead redirect any `?page=` to the latest month (old links are browser history, not shared URLs in a personal app). Simpler, no legacy math.
6. **Composable** — extend `use-url-pagination.svelte.ts` sibling `useMonthParam` rather than warping the page-number API.

## Risks / Trade-offs

- [A huge month = a huge page] — realistic personal ledgers are tens-to-low-hundreds of rows/month; acceptable without inner pagination. Mitigation if ever needed: in-month anchor nav, not re-splitting.
- [Months with zero transactions disappear from nav] — by design (skip empties); the select lists only data-bearing months, newest first.
- [UTC vs local month edges] — grouping is already UTC-based; the range query uses the same boundary definition, so display and query agree.

## Migration Plan

Swap route query handling + UI in one pass; keep function signature of load internal. No schema change. Rollback = revert route files.
