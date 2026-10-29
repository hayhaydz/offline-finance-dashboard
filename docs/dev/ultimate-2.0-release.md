# ULTIMATE 2.0 Release — Change Log & Runbook

**Branch:** `release/ultimate-2.0` (experimental offshoot of `main`) · **Run window:** 2026-10-27 → 2026-10-29 · **Method:** autonomous opencode loop (`.docs/plans/2026-10-27-2145-ultimate-release-loop-plan.md`)

## What shipped

### Bug fixes (from the 2026-10-27 full UX audit)
- **P0-1** goal detail TDZ crash · **P0-2** ciphertext leak on sealed descriptions (`[encrypted]` passthrough + seed keyring fix) · **P0-3** `[object Object]` error page.
- **P1-1…P1-9**: PSA `<br>` leak, liabilities formatting, breadcrumb slugs/labels/capitalisation, debt milestone inversion + payment history, shared goal-progress fn (unit-tested), Newest-First semantics, account-count consistency (open-only policy), PaginationClient console.logs, Ready-to-Assign semantics.
- **P2-1/2/4/5**: styled delete-confirm modal, ISA over-subscription warning, copy nits across target label/login/apply-from/ISA pacing/profile rename.
- **Phase 8 P1-NEW-1**: cashflow calendar read *sealed* description columns — recurring detection was structurally dead; fixed by decrypting per row before grouping (live before/after verified, test data reverted).
- **Final-sweep fixes (2026-10-29)**: mobile horizontal scroll on every page (nav rows never wrapped → `flex-wrap`, 10/10 routes clean at 390px, vision-verified); tools compound projector crash on cleared number fields (null `.toLocaleString()` TypeError → null-safe summary + clamps in `tool-math.ts`: finite guards, rate ≤15%, years ≤40); burn-down chart legend (final-audit P1 — actual spend / even pace / today / target).

### New modules
- **Reports** (`/overview/reports`): net worth over time (1y/5y/all), assets-vs-liabilities stacked area, spending by category (monthly bars), interest actual-vs-projected + PSA bullet, debt waterfall + payoff projection lines. Per-chart `[SVG]`/`[PNG]` export; print stylesheet; `[ASCII]` text-render mode persisted to localStorage.
- **Tools** (`/tools`): rate-change what-if (±2% sliders → interest + tax-above-PSA), overpayment simulator (engine-parity-tested vs `calculatePayoffProjection`), ISA optimiser (band-aware), savings compound projector. Server loader assembles ONLY from existing engines; client math in pure `tool-math.ts`.

### Visualisation system (Variant B: crisp SVG, terminal theme)
11 chart types: net worth line, stacked area, category bars, monthly spend, PSA bullet, debt waterfall, payoff lines, goal bullet bars w/ milestone ticks, net-worth sparkline, rate heatmap (ink-density), allocation composition bar, cashflow calendar (recurring-pattern projection). Every chart panel carries a text summary (a11y) + `[SVG]`/`[PNG]` export.

### Interaction & surface intelligence
j/k/Enter list navigation (accounts, goals, snapshots), `?` help overlay, ⌘K command palette (⌘K → filter → Enter navigation live-verified), uncategorised-bucket triage, bulk balance-update screen, staleness dots, category system w/ auto-suggest, filter type-to-search w/ counts, flat-view toggle, print/PDF monthly report stylesheet.

### Accessibility (Phase 9)
Global `:focus-visible` black outline ring; `text-gray-400` → `text-gray-500` across 32 files (AA contrast on white: 2.5:1 → 4.8:1); `[Skip to content]` first tab stop (off-screen until keyboard focus); `<main id="main-content">` landmark; SubmitFeedback `role=alert`/`role=status` so screen readers announce action results; overlay focus capture/restore.

## Runbook

```bash
git switch release/ultimate-2.0
npm install            # deps unchanged from main (package.json locked)
npm run db:setup       # or reuse storage/dev-plain.db
npx tsx scripts/seed.ts --mode=standard
npm run dev            # → http://127.0.0.1:5173  (admin / password)
```

- **Gates:** `npm run check` (0 errors/0 warnings) · `npm test` (134 files / 982 tests).
- **Charts:** hand-rolled SVG; layerchart remains ONLY inside `HistoryTrendChart` (hover interactions on expenses + tax-income routes; lazily chunked — ~444KB loads on those routes only).
- **Key decisions ledger:** `ULTIMATE-PROGRESS.md` (Decisions table).
- **Re-audit evidence:** `.docs/reviews/2026-10-28-2252-ultimate-loop-audit/` (28 screenshots, all vision-CLEAN; findings.md) + final sweep 2026-10-29 (7 more route screenshots, all CLEAN after the burn-down legend fix; console/5xx sweep across all 25 routes = 0 errors).

## Known deferred (with reasons)

All 8 harvested P2 chart/form nits were fixed during Phase 9 polish cycles (PSA legend, waterfall truncation, net-worth value tag, goal tick legend + %-rounding, type auto-suggest, duplicate-name hint, zero-month labels — plus palette drift for /accounts/balances and print-chrome strips). The category-select auto-match quirk below was fixed on 2026-10-29 (`String(cat.id)` option values). Deferred from the final vision sweep: snapshots' `formatCurrencyShorthand` drops `.00`/collapses exact £k (P2 — deliberate app-wide compact convention, changing one page would create real inconsistency). CSV export overhaul + 0%-intro credit-card split tracker + payslip/bills import pipeline + data scramble tool (hayhaydz notes) — sized as future projects, not this release.

## Known quirks (for future maintainers)

- **[FIXED 2026-10-29] Category select stayed blank on programmatic auto-match**: root cause was NOT DOM clobbering (a MutationObserver showed zero events) — Svelte 5's compiled select matcher compares each option's typed `__value` against the value expression without coercion, so a number option (`value={cat.id}`) never matched the string state (`String(cat.id)`) and the select fell through to `selectedIndex = -1`. Fix: render option values as strings (`value={String(cat.id)}`). Worth knowing anywhere Svelte 5 selects are driven by typed state.
- **CDP browser sessions die <60s after login** (idle-logout beacon doesn't count CDP events as trusted activity). Workaround that reliably beats it: navigate to the target route (redirects to `/login?redirectTo=…`), log in, and drive everything through ONE `evaluate_script` round-trip that dispatches real DOM events.
- **Chrome DevTools fullPage screenshots clip at `.scrollable-content` max-height** — panels below the fold look "missing" to vision models. Always cross-check bottom-of-page vision claims against the a11y tree or curl SSR before acting.
- **devalue action responses dedupe values as array indices** — `{"success":1,"updated":2}` can actually be `[true, 0]` references. Verify action outcomes via server logs, never by eyeballing the payload.
- **Svelte 5 `{@const}` must sit directly inside a block**, not the SVG root — use script-level `$derived`s for chart label positions.
- **The edit tool occasionally reports success without writing** (tab/space drift on complex files). For targeted line changes, an `awk`/python rewrite with an `assert old in src` guard is the reliable path — and always re-read the section after.
