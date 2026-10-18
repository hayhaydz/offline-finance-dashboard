## Why

Users may forget to create monthly reviews, leading to gaps in their financial tracking routine. The review checklist already exists but there's no proactive reminder to initiate a new review when the month changes.

## What Changes

- Add a new `NO_MONTHLY_REVIEW` alert type that fires when no review exists for the current calendar month
- **Escalating severity** based on days into month:
  - Days 1-7: `info` (friendly reminder)
  - Days 8-14: `amber` (warning - getting late)
  - Day 15+: `red` (critical - half the month gone)
- Links directly to the reviews page so users can quickly create one

## Capabilities

### New Capabilities

- `monthly-review-reminder`: Alert that checks if a monthly review exists for the current month and reminds users to create one if missing

### Modified Capabilities

- *(none - this is a new independent alert)*

## Impact

- **Alerts System**: Add new `NO_MONTHLY_REVIEW` to `AlertType` union in `src/lib/types/alerts.ts`
- **Alert Generator**: Add `checkMonthlyReviewAlerts()` function in `src/lib/server/alerts.ts`
- **Database**: Query `monthlyReviews` table to check for current month's review
