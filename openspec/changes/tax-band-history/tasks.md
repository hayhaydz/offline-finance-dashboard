## 1. Schema + seed

- [x] 1.1 Add `tax_band_history` table (`userId, band, fromTaxYear, toTaxYear nullable`); `db:push`; update `scripts/seed.ts` (bands per seed persona incl. a threshold-crossing example)
- [x] 1.2 Backfill script/migration: one row per user from legacy enum, `fromTaxYear = current tax year`
- [x] 1.3 Add `income_history` table (`userId, month YYYY-MM unique per user, grossIncomeInCents >= 0, note nullable`); `db:push`; seed multi-year income history for the persona (incl. a salary-change year and a gap year exercising all verdict states)
- [x] 1.4 Per-tax-year threshold config (constants map, £50,270 / £150,000 defaults; future years inherit latest known)

## 2. Resolver

- [x] 2.1 New `src/lib/server/tax-bands.ts`: `bandForTaxYear(userId, taxYear)` — covering row, else nearest earlier, else legacy enum fallback; overlap validation helper
- [x] 2.2 Unit tests: covering row, gap fallback, no-history fallback, overlap rejection, mid-year normalisation (July 2026 → 2026/27)

## 3. Call-site retrofit

- [x] 3.1 Replace direct `taxBand` reads with resolver in interest tax calcs, PSA logic, ISA projections (`src/lib/server/account-tax-year.ts`, `interestBreakdown/*`, `isaPacing.ts`)
- [x] 3.2 Snapshot creation resolves band for the snapshot's tax year (audit #7); regression test replaces the hardcoded-basic behaviour
- [x] 3.3 Interest year page: per-year band badge + PSA; current year "(expected)" label; band-changed-this-year note (no pro-rata explainer); badge links to `/overview/tax`
- [x] 3.4 Remove the legacy `taxBand` section from `/settings/general` (form + load); settings returns to pure preferences

## 4. Tax section + income history UI

- [x] 4.0 New `/overview/tax` route (finder headline + band history list) and `/overview/tax/income` route; nav gains Overview → Tax child; terminal aesthetic, `use:enhance` + feedback everywhere
- [x] 4.1 Year × month entry grid at `/overview/tax/income` (sparse entry, £0 distinct from missing, gaps visible, visible feedback)
- [x] 4.2 Range-fill action ("£X/mo from A to B") with overwrite confirmation naming the count
- [x] 4.3 Single-month edit/remove actions, user-scoped

## 5. Band finder

- [x] 5.1 Finder computation in `tax-bands.ts`: known months + auto non-ISA interest (from interest breakdown) vs per-year thresholds; verdict states FIRM / EXPECTED / BOUNDED / UNKNOWN; bounded reverse-computation and "over regardless" branch
- [x] 5.2 Finder UI per tax year: visible arithmetic (known total, projection assumption editable, interest prefill, threshold, margin), verdict state label
- [x] 5.3 `[Apply as band]` writes the band row from the verdict (with feedback); no automatic band mutation anywhere
- [x] 5.4 Tests: all four verdict states, ISA exclusion, projection assumption override, apply action, bounded math

## 6. QA

- [x] 6.1 Tests: past-year band applied (2025/26 higher → £500 PSA), overlap rejection, gap fallback messaging, finder matrix
- [x] 6.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
