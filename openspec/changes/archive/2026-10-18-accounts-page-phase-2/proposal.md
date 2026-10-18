## Why

The accounts detail page already surfaces key financial data but lacks structural context in the transaction ledger, actionable tax-efficiency warnings for savings accounts, and scenario-based insight for debt repayment decisions. Phase 2 adds the next layer of value using data that is already available or requires only minor server additions.

## What Changes

- **Transaction ledger**: Group rows by calendar month with a one-line net flow summary header per group (count, total in, total out, net)
- **PSA Burn Rate Projection**: In the interest summary widget for non-ISA savings accounts, show how much of the Personal Savings Allowance has been consumed and project whether the limit will be breached before the tax year ends
- **ISA Allowance Fill Projection**: In the ISA allowance widget, project when the ISA will be full based on the last 3 months of deposit cadence
- **Overpayment Scenario Rows**: In the debt projection section, show a compact 3-column comparison table for minimum payment, +25%, and +50% payment scenarios (TTZ, total interest, debt-free date)

## Capabilities

### New Capabilities

- `transaction-monthly-grouping`: Groups paginated transaction list by year-month with a per-group net flow summary header (count, in, out, net)
- `psa-burn-rate-projection`: Calculates PSA consumption rate and projects the month in which the Personal Savings Allowance will be exceeded given current interest accrual
- `isa-fill-projection`: Projects the month the ISA allowance will be fully subscribed based on average monthly deposit cadence over the last 3 months
- `debt-overpayment-scenarios`: Server-side pre-computation of TTZ and total interest for three payment scenarios (minimum, +25%, +50%), displayed as a comparison table

### Modified Capabilities

- `debt-projection-metrics`: Adding overpayment scenario data to the existing projection metrics loaded in `+page.server.ts`

## Impact

- `src/routes/accounts/[slug]/+page.svelte` — UI changes for all four features
- `src/routes/accounts/[slug]/+page.server.ts` — Additional server-side computation for debt overpayment scenarios
- `src/lib/utils/debt-calculator.ts` — `calculateTTZ()` called with alternate payment amounts for scenario rows
- `src/lib/server/interestBreakdown.ts` — PSA projection logic (or can be derived in page server)
- `src/lib/server/isaBreakdown.ts` — Deposit cadence calculation for fill projection
