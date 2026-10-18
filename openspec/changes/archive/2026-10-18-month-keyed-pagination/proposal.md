## Why

The account ledger paginates by a fixed 20 rows (`TRANSACTIONS_PER_PAGE`, `src/routes/accounts/[slug]/+page.server.ts:77`) and then groups rows by month for display — so months get chopped across page boundaries and each page's month header totals (inflow/outflow/net) are computed from a partial slice, making them wrong on both pages (`.docs/notes/2026-10-18/` note 03, sources 2026-05-08/05-17/10-14). Pagination is also "too short", and the monthly balance summary and the transaction pagination are independent views that don't sync.

## What Changes

- **Month-keyed ledger pagination**: the account detail transactions switch from `?page=N` offset pagination to `?month=YYYY-MM`. One page = exactly one month. Month totals are computed server-side from the full month range and are always truthful. "Too short" disappears (a full month is a page).
- **Prev/next with data**: prev/next navigation moves to the previous/next month that has transactions (skipping empty months); a jump-to-month select is built from the months list the page already returns.
- **Summary/pagination sync** (2026-05-17 ask): the monthly balance summary strip becomes the navigation — clicking a month in the summary jumps the ledger to that month (one URL param drives both views).
- **Backwards compatibility**: old `?page=N` URLs redirect to the month containing that page's first row (or simply to the latest month — decided in design).

## Capabilities

### New Capabilities

- `month-keyed-ledger-pagination`: Account detail transaction ledger paginated by month key — whole months never split, per-month totals always computed from complete month data, navigation via prev/next data-bearing months and a month select synced with the monthly summary

### Modified Capabilities

(none — `account-balance-delta` spec covers the delta strip, whose requirements don't change)

## Impact

- **Files**: `src/routes/accounts/[slug]/+page.server.ts` (query by month range, totals per month), `+page.svelte` (ledger + summary sync), `src/lib/utils/transaction-grouping.ts` (single-month grouping), `src/lib/utils/use-url-pagination.svelte.ts` (month param support or a sibling composable)
- **Schema**: none
- **Tests**: month-boundary totals, empty-month skipping, `?page` redirect
