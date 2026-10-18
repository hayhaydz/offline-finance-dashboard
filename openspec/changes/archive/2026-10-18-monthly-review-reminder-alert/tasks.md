## 1. Types

- [x] 1.1 Add `NO_MONTHLY_REVIEW` to `AlertType` union in `src/lib/types/alerts.ts`

## 2. Alert Logic

- [x] 2.1 Create `checkMonthlyReviewAlerts()` async function in `src/lib/server/alerts.ts`
- [x] 2.2 Query `monthlyReviews` table for current year-month review (using `yearMonth` field)
- [x] 2.3 Return early with no alert if review already exists for current month
- [x] 2.4 Calculate severity based on day of month:
  - Days 1-7: `info`, message "No review yet for [Month Year]"
  - Days 8-14: `amber`, message "Review overdue for [Month Year]"
  - Day 15+: `red`, message "Review urgently needed for [Month Year]"
- [x] 2.5 Use `makeGlobalAlert()` with `href: '/reviews'`

## 3. Integration

- [x] 3.1 Add `checkMonthlyReviewAlerts()` call to `getAlerts()` function (parallel with other async checkers in Promise.all)

## 4. Verification

- [x] 4.1 Run `npm run check` to verify TypeScript types
- [x] 4.2 Test alert shows `info` severity on days 1-7 when no review exists
- [x] 4.3 Test alert shows `amber` severity on days 8-14 when no review exists
- [x] 4.4 Test alert shows `red` severity on day 15+ when no review exists
- [x] 4.5 Test alert is suppressed when review exists for current month
