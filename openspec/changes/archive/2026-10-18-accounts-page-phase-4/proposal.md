## Why

Phases 1–3 have addressed all quick wins and medium-complexity features on the accounts detail page. Phase 4 tackles the remaining exploratory items from the roadmap — higher-complexity, higher-value features that require cross-account queries, pattern detection, or extensions to existing interactive tools. These are the features that provide the deepest financial insight but demand more design care to avoid false positives or misleading data.

## What Changes

- Add a **What-If Rate Change** stress test on debt accounts — extends the Phase 3 overpayment simulator (or sits alongside it) to show how TTZ and total interest change if the interest rate rises or falls
- Add a **Snowball / Avalanche cross-account payoff tip** on debt accounts — fetches all liability accounts for the user and surfaces a one-line payoff strategy note (highest rate = avalanche priority; lowest balance = snowball priority)
- Add **Recurring Transaction Detection** in the transaction ledger — server-side pattern detection groups transactions with the same description and similar amounts across history, surfacing a passive note per detected pattern
- Add a **Break-Even Month marker** in the debt projection table — marks the row where cumulative interest paid crosses the original principal borrowed, for installment loans/mortgages with `originalPrincipal`

## Capabilities

### New Capabilities

- `rate-change-simulator`: Extends the debt projection section with a rate stress-test UI — static rows at +2% / +5% or interactive input, showing TTZ and interest impact of rate changes
- `debt-payoff-strategy`: Cross-account query on liability accounts to surface a one-line avalanche or snowball priority tip on the current account's projection section
- `recurring-transaction-detection`: Server-side grouping of full transaction history by description+amount pattern, displayed as passive inline notes in the ledger
- `break-even-month`: Projection table augmentation that marks the crossover month where cumulative interest exceeds `originalPrincipal` for installment debt

### Modified Capabilities

- `debt-projection-metrics`: Rate change simulator augments the existing projection section; break-even month annotates the projection table rows

## Impact

- **Server:** `+page.server.ts` gains cross-account query (all user liabilities) for payoff strategy; recurring transaction grouping query; break-even calculation using `account.originalPrincipal`
- **Client:** `+page.svelte` gains rate simulator input (extends overpayment simulator pattern); payoff strategy tip; recurring transaction inline notes; break-even table row marker
- **Schema:** No new fields required — `originalPrincipal` already exists (or is confirmed present); no new tables
- **Files affected:** `src/routes/accounts/[slug]/+page.server.ts`, `src/routes/accounts/[slug]/+page.svelte`, `src/lib/utils/debt-calculator.ts`
