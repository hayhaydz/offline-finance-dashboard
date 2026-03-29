## 1. Rate Change Stress Test

- [x] 1.1 In `+page.server.ts`, compute `rateScenarios` array: two entries at current rate +200bp and +500bp, each containing `{ rate, ttz, totalInterest, debtFreeDate }` via `calculateTTZ()`; cap TTZ display at 300 months
- [x] 1.2 Pass `rateScenarios` in the page data return object (only populated for liability accounts with non-null `ttz.months`)
- [x] 1.3 In `+page.svelte`, render rate scenario rows in the debt projection section showing rate, TTZ, TTZ delta vs current, total interest, and debt-free date
- [x] 1.4 Style TTZ delta annotation in `text-amber-700`; hide section for CRITICAL accounts (`ttz.months === null`)

## 2. Debt Payoff Strategy Tip

- [x] 2.1 In `+page.server.ts`, query all liability accounts for the current user using `withUserFilter(locals.user.id, accounts)` filtered by `category = "liability"`
- [x] 2.2 Compute `liabilityContext`: determine if current account is avalanche priority (highest rate) or snowball priority (lowest balance); expose `{ strategy: "avalanche" | "snowball" | null, totalLiabilities: number }`
- [x] 2.3 Pass `liabilityContext` in the page data return object
- [x] 2.4 In `+page.svelte`, render one-line tip in debt projection section when `strategy` is non-null and `totalLiabilities > 1`; hide when user has only one liability

## 3. Recurring Transaction Detection

- [x] 3.1 In `+page.server.ts`, query all transactions for the account (no pagination limit); group by `LOWER(TRIM(description))`, filter groups with ≥ 3 occurrences and amounts within ±10% of median
- [x] 3.2 For qualifying groups, check that ≥ 2 inter-occurrence gaps fall in the 28–35 day range; exclude descriptions with ≤ 3 characters
- [x] 3.3 Build `recurringPatterns` array: each entry has `{ description, approximateAmount, lastDate }`; pass in page data return object
- [x] 3.4 In `+page.svelte`, render recurring pattern notes above the transaction ledger: `"<Description>" appears monthly (~£X.XX). Last entry: <Date>.`; render nothing if array is empty

## 4. Break-Even Month Marker

- [x] 4.1 In `+page.server.ts`, compute `breakEvenMonthIndex`: first 0-based index in `data.projection` where running cumulative interest sum ≥ `account.originalPrincipal`; set to `null` if `originalPrincipal` is null or crossover never occurs
- [x] 4.2 Pass `breakEvenMonthIndex` in the page data return object
- [x] 4.3 In `+page.svelte`, annotate the matching projection table row with `← crossover: cumulative interest now exceeds original principal`; only the first crossover row is annotated
- [x] 4.4 Verify the feature is hidden (no annotation rendered) when `breakEvenMonthIndex` is `null`
