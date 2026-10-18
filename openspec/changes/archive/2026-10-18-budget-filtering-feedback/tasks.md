## 1. Form feedback (audit #5)

- [x] 1.1 Wire `use-submit-feedback` into all six budgets forms on `/overview/budgets/[month]` + month config forms; success + error rendering per form
- [x] 1.2 Add client-side validation (numeric amounts, non-empty selections) matching server rules
- [x] 1.3 Acceptance check from note 05: a failed toggle is visibly different from a successful one; no interaction silently navigates away

## 2. Type filter

- [x] 2.1 Add `excludedTypes` to budget month config (JSON column via `db:push`); validate against `TRANSACTION_TYPES` on write; update `scripts/seed.ts`
- [x] 2.2 Apply type exclusions in all spending queries (`src/lib/server/budgets.ts`) on top of the taxonomy spending rules
- [x] 2.3 Filter panel gains type include/exclude UI + the spending-definition footnote (from `transaction-taxonomy`)

## 3. Budget scoping

- [x] 3.1 Budget creation flow gains account multi-select with explicit "all accounts" toggle
- [x] 3.2 Scope editable post-creation via the existing account panel (no behaviour change for pre-existing budgets)

## 4. Config revision + amendment trail

- [x] 4.1 Add `budget_config_amendments` table (`budgetMonthId, field, oldValue JSON, newValue JSON, note nullable, createdAt`) via `db:push`; update `scripts/seed.ts` (one amended past month as fixture)
- [x] 4.2 Wrap every config mutation (targets, category/account include-exclude, `excludedTypes`, scoping) in an amend-and-trail write helper — old→new diff per field, automatic timestamp, optional note
- [x] 4.3 Forward-apply affordance on config edit forms: `[x] apply from this month onward` (current + future rows, each trailed) vs `this month only` (default)
- [x] 4.4 Month page: inline `[amended <date> — was X]` markers on changed config values + expandable amendment list
- [x] 4.5 Budgets index: year-level amendment timeline (cross-month, reverse-chronological, expandable)

## 5. QA

- [x] 5.1 Tests: type exclusion across totals/breakdown/targets, scoping (account C invisible), form feedback paths
- [x] 5.2 Tests: retroactive edit trails old→new; forward-apply writes N trailed rows and zero past rows; transactions untouched by any config edit; optional note
- [x] 5.3 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
- [ ] 5.4 Re-test the 2026-10-16 symptom after `session-timer-reliability` lands; record result in note 05
