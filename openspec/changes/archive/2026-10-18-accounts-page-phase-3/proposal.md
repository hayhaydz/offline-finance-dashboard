## Why

The accounts detail page already surfaces key debt metrics and allowance data (Phase 1 & 2), but lacks interactive tooling, full account history context, and rate benchmarking against the market. Phase 3 adds the three remaining medium-complexity features from the roadmap that require schema changes, new interactive UI patterns, or meaningful new server logic.

## What Changes

- Add an **inline overpayment simulator** on debt accounts — a live-updating payment input that recalculates TTZ and total interest client-side as the user types
- Add **account age display** in the account header — requires a new nullable `openedAt` field on the accounts schema, an edit form field, and display logic
- Add a **Bank of England base rate context line** near interest rate displays — requires a new `settings` key-value table to store the BoE base rate, and spread calculation logic on the account page

## Capabilities

### New Capabilities

- `overpayment-simulator`: Client-side interactive debt repayment simulator with debounced payment input, live TTZ/interest recalculation, and savings diff display
- `account-age`: Schema field (`openedAt`) + server load + header display showing how long the account has been open
- `boe-base-rate`: Settings table + admin/manual update path + spread calculation and display on interest-bearing accounts

### Modified Capabilities

- `debt-projection-metrics`: The overpayment simulator augments (or replaces) the static overpayment scenario rows from Phase 2.4; the simulator renders in the same section

## Impact

- **Schema:** `accounts` table gains `openedAt TIMESTAMP NULL`; new `settings` table (`key TEXT PK, value TEXT, updatedAt TIMESTAMP`)
- **Server:** `+page.server.ts` reads `openedAt` and `settings.boeBaseRate`; `scripts/seed.ts` updated for both
- **Client:** `+page.svelte` gains simulator input with `$derived` TTZ recalculation; `debt-calculator.ts` logic ported to a client-side utility or reused via import
- **Forms:** Account edit page gains `openedAt` date field
- **Files affected:** `src/lib/db/schema.ts`, `src/routes/accounts/[slug]/+page.server.ts`, `src/routes/accounts/[slug]/+page.svelte`, `src/routes/accounts/[slug]/edit/+page.svelte`, `scripts/seed.ts`
