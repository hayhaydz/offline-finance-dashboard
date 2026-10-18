## 1. Ledger prefilter params (after `month-keyed-pagination`)

- [ ] 1.1 Accept `type` param in `src/routes/accounts/[slug]/+page.server.ts`; validate against `TRANSACTION_TYPES`; client-side filter of the month's rows with visible `[Type: X] [Clear]` chip; month totals stay full-month
- [ ] 1.2 Ignore invalid filter values; params never written to stored state
- [ ] 1.3 Tests: prefiltered render, invalid param, clear-chip behaviour

## 2. Alert href wiring

- [ ] 2.1 Build the alert-type link table (type → href pattern | none-why) for all computed alert types; review in-PR
- [ ] 2.2 Set `href` in alert builders: account/rate/maturity alerts → account ledger (with `month` where relevant); budget alerts → `/overview/budgets/[month]`; ISA alerts → `/accounts/isa`; goal alerts → `/goals/[slug]`
- [ ] 2.3 Unmatched-transfer alerts: primary link to the `transfer_in` account ledger (`?type=transfer_in&month=…`); secondary counterpart link when a candidate account exists
- [ ] 2.4 Verify `AlertBadge` renders links on both `/alerts` and inline account surfaces

## 3. QA

- [ ] 3.1 Tests: href set per actionable type, linkless set per informational type, unmatched-transfer link shape (slug-based, no IDs)
- [ ] 3.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
