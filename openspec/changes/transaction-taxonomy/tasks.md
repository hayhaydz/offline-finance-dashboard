## 1. Glossary + constants

- [ ] 1.1 Write `docs/transactions/type-glossary.md` with the rulings from design (deposit/withdrawal, transfers, interest vs accrued, charge/payment/interest_charge, refund, value_change)
- [ ] 1.2 Add type label map + one-line helper text + per-account-category filter map to `src/lib/utils/domain-constants.ts`

## 2. `refund` type (schema + validators)

- [ ] 2.1 Add `refund` to the `accountTransactions.type` enum in schema; run `db:push`; update `scripts/seed.ts` immediately
- [ ] 2.2 Confirm `TRANSACTION_TYPES` consumers (csv-parser, imports validation) pick up `refund` automatically; add test coverage
- [ ] 2.3 Settings/data utility: list `value_change` rows on credit-card accounts with negative amounts; offer confirmed one-click reclassification to `refund` with a row-count report

## 3. Creator form parity

- [ ] 3.1 Replace hardcoded options in `TransactionsSection.svelte` with `TRANSACTION_TYPES`-driven rendering (labels + helper text + category filter)
- [ ] 3.2 Verify type selection persists correctly through the create action (no server-side type narrowing surprises)

## 4. Budget spending rules

- [ ] 4.1 Update spending filters in `src/lib/server/budgets.ts:88,148,261` to `withdrawal + charge − refund`; keep transfers/payments excluded
- [ ] 4.2 Add the spending-definition footnote to the budget UI (filter panel)
- [ ] 4.3 Verify interest/ISA breakdowns treat `interest_accrued` as excluded from actuals (fix call sites if not); add regression test

## 5. QA

- [ ] 5.1 Tests: refund netting in budgets, accrued-interest exclusion, creator type parity, reclassification utility
- [ ] 5.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`; note in tasks that `budget-filtering-feedback` is unblocked
