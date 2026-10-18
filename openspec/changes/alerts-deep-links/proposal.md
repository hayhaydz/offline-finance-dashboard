## Why

`AlertBadge.svelte:62-65` renders a link only when an alert sets `href`, and most computed alerts — including unmatched-transfer alerts (`src/lib/server/alerts/async-accounts.ts:305+`) — set none, so the user can't jump from an alert to the thing that triggered it (`.docs/notes/2026-10-18/` note 10, source 2026-05-04: "can't open 'unmatched transfer'. can't open any alerts in `/alerts`").

## What Changes

- **Linking convention first**: agree URL shapes for alert deep links that respect the no-IDs-in-URLs rule (slugs + query filters), e.g. `/accounts/[slug]?type=transfer_in&date=YYYY-MM` prefiltering the ledger, `/overview/budgets/[month]`, `/accounts/isa`.
- **Unmatched-transfer alerts link to the offending rows**: link to the detected account's ledger prefiltered to the alert's match window (both sides of the unmatched pair where applicable).
- **Audit all alert types for missing `href`s**: every alert type that has a natural destination (account, goal, budget month, ISA page) sets one; alerts with no actionable destination (e.g. informational market notes) intentionally omit it — documented per type.
- **Ledger prefilter support**: account detail ledger accepts query params (`type`, `date`/`month`) that prefilter the displayed transactions, so alert links land on a meaningful view.

## Capabilities

### New Capabilities

- `alert-deep-links`: Actionable computed alerts carry deep links to a destination that lets the user resolve or inspect them; unmatched-transfer alerts link to the prefiltered ledger of the affected account(s)
- `ledger-query-prefilters`: The account detail ledger honours `type` and `month`/`date` query params to prefilter displayed transactions

### Modified Capabilities

(none)

## Impact

- **Files**: `src/lib/server/alerts/*` (set `href` per type), `src/lib/types/alerts.ts`, `src/routes/accounts/[slug]/+page.server.ts` (prefilter params — coordinates with `month-keyed-pagination`), `/alerts` and `/accounts` alert surfaces
- **Coordination**: ledger `month` prefilter should reuse the `month-keyed-pagination` param; sequence that change first or align param names here
- **Non-goals**: alert snooze/acknowledge (parked, note 10 §3); no new alert types
