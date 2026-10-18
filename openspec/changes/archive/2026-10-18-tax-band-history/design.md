## Context

Single `taxBand` enum on the user row (`src/lib/db/schema/auth.ts:20`), no dates — today's band applies to all history. Audit #7 (snapshot hardcodes `basic`) and #22 (settings form gives no feedback) fold in. Note 06. UK tax year = Apr 6 → Apr 5 (AGENTS.md).

## Goals / Non-Goals

**Goals:**
- Dated band history keyed by UK tax year; `bandForTaxYear` resolver used everywhere a band matters
- Monthly gross income history (multi-year) with range-fill backfill; missing = unknown, never zero
- Band finder: per-year threshold verdicts (FIRM/EXPECTED/BOUNDED/UNKNOWN) with non-ISA interest auto-prefill and one-click apply to band history
- Dedicated tax section at `/overview/tax` (finder headline + band history) and `/overview/tax/income` (grid), with form feedback; snapshots resolve band per their tax year

**Non-Goals:**
- HMRC integration / auto-detection of actual income
- Full self-assessment modelling (band + PSA thresholds only, per existing scope)
- Multiple income rows per month (one row per month, gross total; bonuses land in their month — timing within a year doesn't affect the annual verdict)
- Intra-year band splits (not representable; UK tax bands are year-atomic)

## Decisions

1. **`tax_band_history` table** — `id, userId, band, fromTaxYear, toTaxYear (nullable)`, tax years stored as canonical strings `YYYY/YY` (e.g. `2026/27`). Overlap and gap validation in the resolver layer + form. **A mid-year salary change records as a band change from the tax year containing the change** — the tax section UI normalises a July date to "from 2026/27" with an explainer of the year-atomic rule.
2. **`income_history` table** — `id, userId, month (YYYY-MM, unique per user), grossIncomeInCents (>= 0), note (optional)`. Row present = month known (including £0); row absent = unknown. Range-fill action writes/overwrites a contiguous range at £X/mo; individually-entered months are overwritten by range-fill only on explicit confirm.
3. **Finder verdict states (the partial-history contract)**:
   - **FIRM** — 12 known months, year complete → final verdict.
   - **EXPECTED** — future months missing (year in progress): project at last known month's rate (displayed and editable); verdict labelled as assumption-based.
   - **BOUNDED** — past months missing: never invent; reverse-compute "missing months need ≥ £N/mo avg to cross threshold"; if known total alone ≥ threshold → "over regardless of missing months".
   - **UNKNOWN** — no data for the year.
4. **Interest prefill = non-ISA taxable interest only** (auto from the app's interest breakdown for that tax year) — tax-wrappered interest (ISA/LISA/premium-bond wins) doesn't count toward adjusted net income. Thresholds per-tax-year config (constants map defaulting to £50,270 / £150,000), not hardcoded single values.
5. **Resolver, not joins** — `bandForTaxYear(userId, taxYear)` in `src/lib/server/tax-bands.ts`: latest covering row; gap falls back to nearest earlier band with visible "assumed from history" hint; no coverage falls back to the user's legacy enum (kept as denormalised cache, updated on write).
6. **Finder applies, doesn't auto-write** — `[Apply as band]` writes the band row from the verdict; no automatic band mutation ever.
7. **Enum column stays as cache** — retiring it means touching every read site for zero benefit; the resolver prefers the table. Migration risk drops to additive.
8. **Snapshot fix**: snapshot creation calls the resolver for the snapshot's tax year; the stored tax position reflects it (audit #7).
9. **Backfill**: one band row per user from the legacy enum, `fromTaxYear = current tax year`. Income history starts empty — range-fill is the onboarding path.
10. **Schema change** — direct `db:push` (active-dev phase per AGENTS.md); `scripts/seed.ts` updated in the same task (seed persona gains multi-year income history + a threshold-crossing year exercising all verdict states).

## Risks / Trade-offs

- [Users treat EXPECTED verdicts as facts] → assumption line is always rendered with the verdict; the interest page shows current-year band as "(expected)".
- [Range-fill overwrites carefully-entered months] → confirm step naming the count of months to be overwritten.
- [Finder's gross-income entries go stale] → it's an estimator, not payroll; the "applied" band row is what's authoritative; finder re-runs are free.
- [Two sources of truth (enum + table)] → resolver always prefers the table; enum documented as cache; a consistency check on the tax section flags drift.
- [Overview becoming a dumping ground] → accepted trade-off (user decision): Tax is a peer of Budgets/Snapshots — periodic financial content, not a preference; nav stays lean.
- [Thresholds change with policy] → per-tax-year config map; future years default to the latest known values until edited.

## Migration Plan

`db:push` (additive tables + config) → seed update → resolver + call sites → income grid + finder UI. Rollback: additive; revert code and drop tables.
