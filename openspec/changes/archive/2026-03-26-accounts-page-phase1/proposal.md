## Why

The `/accounts/[slug]` page presents balances and debt projections as static snapshots — the numbers are correct but lack the context needed to make them feel real or actionable. All the data to compute richer metrics already exists in the page load; this change surfaces it.

## What Changes

- Add a **balance delta strip** to the account header showing trajectory vs last month and 12 months ago — applies to all account types
- Add **daily interest velocity** to the debt projection summary, reframing monthly interest as a continuous per-day cost
- Add a **payment efficiency metric** showing what fraction of each payment reduces principal vs. services interest
- Add a **minimum payment trap warning** when TTZ exceeds 10 years, surfacing the total cost bluntly
- Add a **cumulative interest column** to the month-by-month projection table, making the running cost visible
- Add an **interest:principal ratio** to the debt projection summary, contextualising the total lifetime cost of the debt

## Capabilities

### New Capabilities

- `account-balance-delta`: Account header strip showing balance change vs last month and 12 months ago, with direction-aware framing (asset vs liability)
- `debt-projection-metrics`: Enhanced debt projection section with daily interest velocity, payment efficiency breakdown, minimum payment trap warning, cumulative interest column, and interest:principal lifetime ratio

### Modified Capabilities

<!-- None — no existing spec-level behaviour is changing; these are additive UI enhancements -->

## Impact

- `src/routes/accounts/[slug]/+page.svelte` — primary file; all changes are in this component
- No schema changes required
- No server-side changes required — all data is already present in the page load (`projection`, `ttz`, `currentBalance`, `monthlyBalances`)
- No new dependencies
