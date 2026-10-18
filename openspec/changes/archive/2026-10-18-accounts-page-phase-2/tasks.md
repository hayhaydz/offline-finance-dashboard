## 1. Transaction Monthly Grouping (Ledger)

- [ ] 1.1 In `+page.svelte`, create a `$derived` expression that groups the `data.transactions` array by year-month key (e.g. `"2026-03"`) preserving order
- [ ] 1.2 For each group, derive: transaction count, total inflows (amount > 0), total outflows (abs of amount < 0), and net (inflows − outflows)
- [ ] 1.3 Replace the flat transaction `{#each}` loop with a grouped structure: render a month header row above each group's transactions
- [ ] 1.4 Style the month header row with `bg-gray-100` to match existing section headers
- [ ] 1.5 Format header as: `<Month> <Year> — <N> transactions · Net: <±£X> (£X in, £X out)`
- [ ] 1.6 Apply `text-green-700` for positive net and `text-red-700` for negative net on the net figure

## 2. PSA Burn Rate Projection (Interest Summary Widget)

- [ ] 2.1 In `+page.server.ts`, after loading `interestSummary`, compute `psaProjection`: if `overAllowance` is true, set a flag and the taxable excess amount; otherwise calculate the projected breach month by dividing `taxFreeStatus.remaining` by the monthly interest estimate and adding to today
- [ ] 2.2 Pass `psaProjection` as part of the page data (or derive inline in the template if trivial)
- [ ] 2.3 In `+page.svelte`, in the interest summary section, add a conditional PSA projection line — suppress if < 50% used and no breach projected
- [ ] 2.4 Render `PSA exceeded — £X taxable` in `text-red-700` when `overAllowance` is true
- [ ] 2.5 Render `PSA: £X of £1,000 used · At current rates, you'll exceed by <Month>` when approaching and breach is projected
- [ ] 2.6 Render `PSA: £X of £1,000 used · On track to stay within limit` when approaching but no breach expected
- [ ] 2.7 Ensure the PSA section does not render for ISA account types

## 3. ISA Allowance Fill Projection

- [ ] 3.1 In `+page.server.ts` (or `isaBreakdown.ts`), compute average monthly deposit cadence from the last 3 `monthlyBalances` entries: take positive balance deltas only, average them; treat negative deltas as zero
- [ ] 3.2 Compute projected fill month: `allowanceRemaining / avgMonthlyDeposit` months from today; if cadence is 0, set projection to null
- [ ] 3.3 Pass cadence and projected fill date as part of ISA summary page data
- [ ] 3.4 In `IsaAllowanceWidget.svelte` (or inline in `+page.svelte`), add the fill projection line below the existing allowance bar
- [ ] 3.5 Render `At £Y/month, you'll fill by <Month>` when cadence > 0 and allowance remaining > 0
- [ ] 3.6 Render `No recent deposits` when cadence is 0 and allowance is not yet full
- [ ] 3.7 Render `Allowance full for this tax year` when `allowanceRemaining === 0`
- [ ] 3.8 When projected fill date is after the tax year end (5 April), append `(tax year ends in X months)` to the projection line

## 4. Overpayment Scenario Comparison Table (Debt Projection)

- [ ] 4.1 In `+page.server.ts`, after computing `ttz`, check if the account is a liability with non-null `ttz.months`
- [ ] 4.2 Derive the effective minimum payment amount from `ttz` data (or `account.minimumPaymentFlat` / `account.minimumPaymentPercentage`)
- [ ] 4.3 Call `calculateTTZ()` with `payment * 1.25` and `payment * 1.50` to get two additional scenario results
- [ ] 4.4 Build `overpaymentScenarios` array with three entries: `{ label, payment, ttzMonths, totalInterest, debtFreeDate }` for minimum, +25%, and +50%
- [ ] 4.5 Compute `debtFreeDate` for each scenario by adding `ttzMonths` to today's date and formatting as `Mon YYYY`
- [ ] 4.6 In `+page.svelte`, below the existing debt projection summary metrics, add the scenario comparison table (only when `data.overpaymentScenarios` is set)
- [ ] 4.7 Render the table with rows: Payment, TTZ, Total Interest, Debt-free Date; columns: Minimum, +25%, +50%
- [ ] 4.8 Style the table header row with `bg-gray-100`; format monetary values using the existing `formatPence` helper
