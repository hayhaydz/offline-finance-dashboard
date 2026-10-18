## 1. Month param composable

- [x] 1.1 Add `useMonthParam` composable beside `use-url-pagination.svelte.ts` (URL-synced `YYYY-MM` state, `goto` with replaceState/noScroll, same guards)

## 2. Server: month-range load

- [x] 2.1 Replace offset/limit ledger query in `src/routes/accounts/[slug]/+page.server.ts` with month-boundary range query (`>= start AND < end`, UTC boundaries matching `transaction-grouping.ts`)
- [x] 2.2 Compute the displayed month's inflow/outflow/net totals from the same complete range (never a slice)
- [x] 2.3 Load data-bearing months list (from monthly balances already fetched) for prev/next/select; default = latest month
- [x] 2.4 Ignore legacy `?page=N` param entirely (no redirect; default month renders)

## 3. UI: ledger + summary sync

- [x] 3.2 Replace page-number pager with prev/next (skip-empty) + month `<select>`; empty months never linked
- [x] 3.3 Make monthly balance summary months clickable — same `?month=` param drives both views

## 4. QA

- [x] 4.1 Tests: month totals completeness (45-row month), skip-empty navigation, legacy redirect, default view
- [x] 4.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`; confirm `alerts-deep-links` can reuse the `month` param
