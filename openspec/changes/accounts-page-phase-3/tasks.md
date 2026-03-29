## 1. Schema Changes

- [x] 1.1 Add `openedAt: integer("opened_at", { mode: "timestamp" })` (nullable) to the `accounts` table in `src/lib/db/schema.ts`
- [x] 1.2 Add a new `settings` table to `src/lib/db/schema.ts`: `key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- [x] 1.3 Run `npm run db:push` to apply schema changes to the SQLite database
- [x] 1.4 Update `scripts/seed.ts`: add `openedAt` values to seeded accounts and insert a seed BoE base rate row (`{ key: "boeBaseRate", value: "450" }`)

## 2. Account Age — Server & Edit Form

- [x] 2.1 In `src/routes/accounts/[slug]/+page.server.ts`, include `openedAt` in the account data returned to the page
- [x] 2.2 In `src/routes/accounts/[slug]/edit/+page.svelte`, add an optional date input for "Opened date" bound to `openedAt`; on save, parse and pass the value to the update action
- [x] 2.3 In the edit form's server action, accept and update the `openedAt` field (handle empty string as null)

## 3. Account Age — UI Display

- [x] 3.1 In `src/routes/accounts/[slug]/+page.svelte`, add a `$derived` expression that computes age years and months from `data.account.openedAt` to today
- [x] 3.2 Render `Opened: <Mon YYYY> · Age: <Xy Zm>` in the account header, guarded by `data.account.openedAt !== null`

## 4. BoE Base Rate — Server

- [x] 4.1 In `src/routes/accounts/[slug]/+page.server.ts`, query `settings` for `key = "boeBaseRate"` and include the parsed integer (basis points) in page data as `boeBaseRate` (null if not set)
- [x] 4.2 Compute `rateSpread = account.interestRate - boeBaseRate` (basis points, signed) server-side and include in page data; set to null if either value is absent

## 5. BoE Base Rate — UI Display

- [x] 5.1 In `src/routes/accounts/[slug]/+page.svelte`, add a conditional spread line near the interest rate display: `Rate: X.XX% (BoE base: Y.YY% · Your spread: ±Z.ZZ%)` — hidden when `boeBaseRate` is null or `account.interestRate` is null/zero
- [x] 5.2 Apply `text-red-700` for positive spread on liabilities, `text-amber-700` for negative spread on assets, `text-green-700` for positive/zero spread on assets

## 6. Overpayment Simulator — Client-Side Logic

- [x] 6.1 In `+page.svelte`, add a `$state` variable `simulatorPayment` initialised to the effective minimum payment in pence (from `data.ttz` / `data.account` minimum payment fields)
- [x] 6.2 Add a debounced `$derived` that calls `calculateTTZ(data.account.currentBalance, data.account.interestRate, { type: "flat", flat: simulatorPayment })` and stores the result as `simulatorResult`
- [x] 6.3 Implement the debounce using `$effect` with a `setTimeout` of 200ms, clearing on re-run, updating `simulatorPayment` from the raw input value
- [x] 6.4 Add a `$derived` for `simulatorDiff`: compute months saved and interest saved vs. the baseline `data.ttz`; set to null when `simulatorPayment` equals the minimum

## 7. Overpayment Simulator — UI

- [x] 7.1 In the debt projection section of `+page.svelte`, render the simulator block only when `data.account.category === "liability"` and `data.ttz.months !== null`
- [x] 7.2 Render a labelled number input: `Payment: [£___]  (minimum: £X.XX)` — input value in £ (divide pence by 100), bounded by min/max attributes
- [x] 7.3 Render the live result line: `TTZ: X months · Interest: £Y · Debt-free: Mon YYYY`
- [x] 7.4 Render the diff line `Saves X months and £Y in interest` (in `text-green-700`) only when `simulatorDiff` is non-null
- [x] 7.5 Hide the `data.overpaymentScenarios` table when the simulator is rendered (simulator supersedes scenario rows per spec)
