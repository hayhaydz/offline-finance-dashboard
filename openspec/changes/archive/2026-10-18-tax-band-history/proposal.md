## Why

Tax band is a single enum on the user row (`src/lib/db/schema/auth.ts:20`) with no dates, so today's band is applied to all history — wrong for anyone who crossed the basic/higher threshold in a past tax year (`.docs/notes/2026-10-18/` note 06, source 2026-10-14: "tax band isn't black and white. it has a start and end date"). This also subsumes two audit items: #7 (snapshot tax position hardcodes `basic`) and #22 (`updateTaxBand` form has no feedback).

## What Changes

- **`tax_band_history` table**: `userId, band (basic|higher|additional), effectiveFrom (tax year), effectiveTo (tax year, nullable)` — keyed by UK tax year (Apr 6 – Apr 5, per AGENTS.md UK tax context), one active band at a time, no overlapping ranges.
- **`income_history` table + `/overview/tax/income` UI (user decisions, 2026-10-18):** monthly gross income record going back multiple years — one row per month (`month YYYY-MM`, `grossIncomeInCents`, optional note); absence of a row means *unknown*, never £0. Includes range-fill ("£X/mo from A to B") for multi-year backfill, and a year × month entry grid with visible gaps.
- **Band finder (the threshold calculator, user decision 2026-10-18)**: per-tax-year verdict answering "does income + interest ≥ threshold?" — sums known months + auto-prefilled **non-ISA** interest from the app's own data, classifies each year as FIRM / EXPECTED / BOUNDED / UNKNOWN, and offers one-click `[Apply as band]` to write the suggested band row. Missing past months are never invented: the BOUNDED state reverse-computes what missing months would need to average to cross the threshold. Future months project at the last known month's run-rate (shown, editable). Thresholds are per-tax-year config defaulting to HMRC values (£50,270 / £150,000).
- **Resolver**: `bandForTaxYear(userId, year)` returns the band in effect for a given tax year; used by interest tax calcs, snapshots, and PSA/ISA projections. Current-band reads derive from the latest row (the enum column is retired or kept as a denormalised cache — decided in design).
- **Dedicated tax section at `/overview/tax` (user decision, 2026-10-18 — content, not settings)**: band history list with add/edit/close dates and the missing form feedback (#22), plus the band finder as the page headline. Income grid lives at `/overview/tax/income`. Overview nav gains a Tax child (Budgets/Snapshots/Routine/Reports/Tax). Settings loses the tax section entirely; the legacy `updateTaxBand` form is removed.
- **Snapshot fix** (audit #7): snapshot creation resolves the band for the snapshot's tax year instead of hardcoding `basic`.
- **Backfill**: single row per user from their current enum value, `effectiveFrom` = current tax year (conservative default; user edits history themselves).

## Capabilities

### New Capabilities

- `tax-band-history`: Dated tax band records keyed by UK tax year with a resolver used by all tax calculations, a dedicated `/overview/tax` content section with form feedback, and no-overlap validation
- `income-history-tracking`: Monthly gross income records with range-fill backfill, where missing months are unknown (never zero) and gaps are visible in the UI
- `band-finder`: Per-tax-year threshold verdicts (FIRM/EXPECTED/BOUNDED/UNKNOWN) combining known income months with auto-computed non-ISA interest, with one-click apply to band history

### Modified Capabilities

(none — snapshots and interest calcs have no existing specs)

## Impact

- **Schema**: new `tax_band_history` + `income_history` tables and per-tax-year threshold config (direct `db:push`, active-dev phase); `scripts/seed.ts` updated immediately per AGENTS.md
- **Files**: `src/lib/db/schema/*`, new `src/lib/server/tax-bands.ts` (resolver + finder), new `src/routes/overview/tax/*` (finder + bands) and `src/routes/overview/tax/income/*` (grid), `src/lib/components/navigation.svelte` (Tax child), `src/routes/settings/general/*` (taxBand section removal), snapshot creation path, interest/PSA calculation call sites, `src/lib/server/account-tax-year.ts`
- **UK tax context**: bands and PSA (£1,000 / £500 / £0) resolve per tax year boundaries, never calendar years; bands are tax-year-atomic (no intra-year splits — a mid-year salary change updates the whole year's band)
