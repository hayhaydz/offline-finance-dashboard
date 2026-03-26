## 1. Account Header — Balance Delta Strip

- [x] 1.1 In `+page.svelte`, locate the account header balance display and add `$derived` values for 1-month delta (`monthlyBalances[0].closingBalance - monthlyBalances[1]?.closingBalance`) and 12-month delta (`monthlyBalances[0].closingBalance - monthlyBalances[11]?.closingBalance`)
- [x] 1.2 Render the delta strip below the balance — guard with `monthlyBalances.length >= 2` before rendering
- [x] 1.3 Apply direction-aware framing: use `▼ £X repaid this month` / `text-green-700` for falling liability balance; `▲ £X from last month` / `text-green-700` for rising asset balance; invert colours for the opposing directions
- [x] 1.4 Show `—` for the 12-month figure when `monthlyBalances.length < 12`
- [x] 1.5 Verify: new account (< 2 months history) shows no strip; account with 3 months shows 1-month delta + `—` for 12-month; account with 12+ months shows both

## 2. Debt Projection — Daily Interest Velocity

- [x] 2.1 In the debt projection summary metrics block, locate the monthly interest display
- [x] 2.2 Add daily velocity inline: `(projection[0].interest / 30.44)` formatted to 2 decimal places, shown as `(£X.XX/day)` adjacent to the monthly figure in `text-amber-700`
- [x] 2.3 Guard with `data.projection?.length > 0`

## 3. Debt Projection — Payment Efficiency Metric

- [x] 3.1 Add a `$derived` expression: `interestPct = Math.round(projection[0].interest / projection[0].payment * 100)`, `principalAmount = projection[0].payment - projection[0].interest`
- [x] 3.2 Render the metric line in the debt projection summary: `Of your £X payment: £Y interest (Z%) · £W principal`
- [x] 3.3 Style interest portion `text-amber-700`, principal portion `text-green-700`
- [x] 3.4 Guard with `data.projection?.length > 0 && projection[0].payment > 0`

## 4. Debt Projection — Minimum Payment Trap Warning

- [x] 4.1 After the health status badge, add a conditional block: `{#if data.ttz?.months !== null && data.ttz.months > 120}`
- [x] 4.2 Render the warning text stating years to pay off and total interest cost (`data.ttz.totalInterest / 100` formatted as £), styled `text-red-700`
- [x] 4.3 Verify: does NOT render when `ttz.months === null` (CRITICAL); does NOT render when `ttz.months <= 120`

## 5. Debt Projection Table — Cumulative Interest Column

- [x] 5.1 Add a `cumulativeInterest` running counter (initialised to `0`) before the `{#each}` block that renders projection rows
- [x] 5.2 Inside each row, increment the counter by `row.interest` and render the cumulative total as a new column `Total Int.`
- [x] 5.3 Right-align the column value with `tabular-nums text-right`, consistent with other monetary columns
- [x] 5.4 Add the `Total Int.` header to the `<thead>` row

## 6. Debt Projection — Interest:Principal Lifetime Ratio

- [x] 6.1 Add a `$derived` expression: `totalRepayment = data.currentBalance + data.ttz.totalInterest`, `interestRatioPct = Math.round(data.ttz.totalInterest / totalRepayment * 100)`
- [x] 6.2 Render in the debt projection summary: `Of total repayment: X% is interest (£Y of £Z)`
- [x] 6.3 Apply `text-amber-700` when `interestRatioPct > 30`
- [x] 6.4 Guard with `data.ttz?.totalInterest !== null` — hide entirely for CRITICAL accounts

## 7. QA

- [x] 7.1 Run `npm run check` — confirm no TypeScript errors
- [x] 7.2 Run `npm test` — confirm no regressions
- [ ] 7.3 Manually verify on a liability account: all 5 new debt metrics render with correct values
- [ ] 7.4 Manually verify on an asset account: balance delta strip renders; no debt projection metrics bleed through
- [ ] 7.5 Manually verify on a new account (< 2 months history): delta strip absent; no JS errors
