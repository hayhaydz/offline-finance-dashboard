## 1. KpiCard `<br>` fix

- [x] 1.1 Replace the `<br>` separator with `" · "` in both `detail` props at `src/routes/accounts/interest/[year]/+page.svelte:143,149`; confirm KpiCard renders plain text only (no `{@html}` introduced)

## 2. Liabilities TTZ guard + reasons

- [x] 2.1 Fix falsy guards at `src/routes/accounts/liabilities/+page.svelte:48,75` to `months !== null && years !== null`; add "pays off this month" rendering for `months === 0`
- [x] 2.2 In `src/routes/accounts/liabilities/+page.server.ts`, compute `projectionNullReason` (`no_minimum_payment` vs `payment_below_interest`) alongside TTZ from the rule/rate inputs
- [x] 2.3 Render reasons: "No minimum payment set [Set rule →]" (amber, links to account edit) vs "Payment below interest — CRITICAL" (red)
- [x] 2.4 Audit `src/lib/components/account/DebtProjectionSection.svelte:210` for the same falsy guard and apply the identical fix + reason rendering

## 3. Goal target editing + over-add display

- [x] 3.1 Add `editGoal` action to `src/routes/goals/[slug]/+page.server.ts` (name + targetAmount; reject target < currentAllocation; `validateUserAccess`; logger not console)
- [x] 3.2 Add edit form to goal detail page (terminal aesthetic, `use:enhance`, success/error feedback)
- [x] 3.3 Replace raw >100% progress display with "REACHED — £X over target" (green) on goal detail and goal list cards; keep ≤100% display unchanged

## 4. QA

- [x] 4.1 Extend liabilities tests: months=0, no-rule, below-interest cases
- [x] 4.2 New test for `editGoal` action (success, below-allocation rejection, cross-user)
- [x] 4.3 Run `npm run check` and `npm test`; update `.docs/VERSION_HISTORY.md`
