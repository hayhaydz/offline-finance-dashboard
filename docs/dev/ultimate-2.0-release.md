# ULTIMATE 2.0 Release — Change Log & Runbook

**Branch:** `release/ultimate-2.0` (experimental offshoot of `main`) · **Run window:** 2026-10-27 → 2026-10-28 · **Method:** autonomous opencode loop (`.docs/plans/2026-10-27-2145-ultimate-release-loop-plan.md`)

## What shipped

### Bug fixes (from the 2026-10-27 full UX audit)
- **P0-1** goal detail TDZ crash · **P0-2** ciphertext leak on sealed descriptions (`[encrypted]` passthrough + seed keyring fix) · **P0-3** `[object Object]` error page.
- **P1-1…P1-9**: PSA `<br>` leak, liabilities formatting, breadcrumb slugs/labels/capitalisation, debt milestone inversion + payment history, shared goal-progress fn (unit-tested), Newest-First semantics, account-count consistency (open-only policy), PaginationClient console.logs, Ready-to-Assign semantics.
- **P2-1/2/4/5**: styled delete-confirm modal, ISA over-subscription warning, copy nits across target label/login/apply-from/ISA pacing/profile rename.
- **Phase 8 P1-NEW-1**: cashflow calendar read *sealed* description columns — recurring detection was structurally dead; fixed by decrypting per row before grouping (live before/after verified, test data reverted).

### New modules
- **Reports** (`/overview/reports`): net worth over time (1y/5y/all), assets-vs-liabilities stacked area, spending by category (monthly bars), interest actual-vs-projected + PSA bullet, debt waterfall + payoff projection lines. Per-chart `[SVG]`/`[PNG]` export; print stylesheet; `[ASCII]` text-render mode persisted to localStorage.
- **Tools** (`/tools`): rate-change what-if (±2% sliders → interest + tax-above-PSA), overpayment simulator (engine-parity-tested vs `calculatePayoffProjection`), ISA optimiser (band-aware), savings compound projector. Server loader assembles ONLY from existing engines; client math in pure `tool-math.ts`.

### Visualisation system (Variant B: crisp SVG, terminal theme)
11 chart types: net worth line, stacked area, category bars, monthly spend, PSA bullet, debt waterfall, payoff lines, goal bullet bars w/ milestone ticks, net-worth sparkline, rate heatmap (ink-density), allocation composition bar, cashflow calendar (recurring-pattern projection). Every chart panel carries a text summary (a11y) + `[SVG]`/`[PNG]` export.

### Interaction & surface intelligence
j/k/Enter list navigation (accounts, goals), `?` help overlay, ⌘K command palette, uncategorised-bucket triage, bulk balance-update screen, staleness dots, category system w/ auto-suggest, filter type-to-search w/ counts, flat-view toggle, print/PDF monthly report stylesheet.

### Accessibility (Phase 9)
Global `:focus-visible` black outline ring; `text-gray-400` → `text-gray-500` across 32 files (AA contrast on white: 2.5:1 → 4.8:1).

## Runbook

```bash
git switch release/ultimate-2.0
npm install            # deps unchanged from main (package.json locked)
npm run db:setup       # or reuse storage/dev-plain.db
npx tsx scripts/seed.ts --mode=standard
npm run dev            # → http://127.0.0.1:5173  (admin / password)
```

- **Gates:** `npm run check` (0 errors/0 warnings) · `npm test` (129 files / 942 tests).
- **Charts:** hand-rolled SVG; layerchart remains ONLY inside `HistoryTrendChart` (hover interactions on expenses + tax-income routes; lazily chunked — ~444KB loads on those routes only).
- **Key decisions ledger:** `ULTIMATE-PROGRESS.md` (Decisions table).
- **Re-audit evidence:** `.docs/reviews/2026-10-28-2252-ultimate-loop-audit/` (28 screenshots, all vision-CLEAN; findings.md).

## Known deferred (with reasons)

P2 backlog (8 cosmetic nits, listed in `ULTIMATE-PROGRESS.md` Notes): PSA panel legend, waterfall name truncation, last-point value tag, goal tick legend, tick-% rounding, type auto-suggest, duplicate-name hint, zero-month label visual. CSV export overhaul + 0%-intro credit-card split tracker + payslip/bills import pipeline + data scramble tool (hayhaydz notes) — sized as future projects, not this release.
