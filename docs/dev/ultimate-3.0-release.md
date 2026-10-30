# ULTIMATE 3.0 Release — Change Log & Runbook

**Branch:** `release/ultimate-3.0` (off `release/ultimate-2.0` @ 6e34352) · **Run window:** 2026-10-29 → (in progress) · **Method:** autonomous opencode loop, block-sweep engine (`.docs/plans/2026-10-29-1850-ultimate-v3-loop-plan.md`) · **Progress ledger:** `ULTIMATE-V3-PROGRESS.md`

## The headline changes

1. **Full-viewport desktop shell.** The app is no longer a narrow centred box: the shell is a maximised terminal window pinned to the viewport height with internal scrolling, `viewport meta width=1280` (mobile renders as a zoomed-out desktop), nav rows never wrap, and every surface was converted from 1-column stacks to sized multi-column grids (3/2 splits, bento cells).
2. **Credit-card stoozing as a first-class citizen.** Per-card strategy modes (pay-off vs stooze), Monzo-method per-charge pay-off plans, a statement-delay-aware 0% split tracker, and revert-APR "what it costs if you're late" math — all in a pure-function engine with hand-computed tests.
3. **A Matrixify-class data pipeline.** The unified reimport engine (insert/edit/delete in one file, preview → automatic before-backup → atomic commit) gained self-describing exports with per-account legends, expenses+income history CSV round-trips, a sealed-at-rest background job queue for large imports, and bulk bank-statement import with Monzo column auto-detection.
4. **Reports v2.** Six dated, science-paper-structured reports (title/abstract/method/findings) generated from a registry — each a focused question with auto-written abstracts carrying real numbers, figures reusing the chart system, print + ASCII render modes.
5. **A tools wing.** `/tools` became an index of six sub-pages (four deepened classics + stooze calculator + milestone projector), all sharing the parity-tested `tool-math.ts`.

## Detailed change log

### Shell & viewport (B01)
- `app-shell` flex column pinned to `calc(100vh-1rem)`; `.scrollable-content` internal scroll; print releases the pinned height (`.app-shell` target — SvelteKit's `display:contents` wrapper makes `body > div` selectors wrong).
- Viewport meta `width=1280` (mobile = zoomed-out desktop, no separate mobile design — v2's flex-wrap responsive work superseded).
- Nav + subnav rows `flex-nowrap` + `overflow-x-auto`.
- Top bar: `[⌘K]`/`[?]` single-bracket fix (CSS pseudo-brackets, not literal text) + right-clustered de-crowded layout. The same literal-bracket bug class was swept app-wide later (58 instances, R-H4) with a regression net.
- Sealed root confirmed: unauthenticated `/` → `/login?reason=logged-out` showing "You have been logged out. Data is sealed."

### Home (B02)
- Header reverted to pre-v2 form (trend sparkline removed from `NetWorthDisplay`).
- Untitled bento viz gallery: trend cell (wide, 900×180 aspect) + allocation cell + cashflow cell, click-to-expand per cell; ChartPanel gained `h-full`/flex so neighbouring panels align.
- Two-column rows: tax-year+ISA widgets, INTEREST+ALERTS, ACCOUNTS+GOALS (conditional spans when data absent).

### Goals (B03)
- Milestone tick lines removed from all bar components (bars pre-v2 form); textual milestone labels and the milestone data model kept. Allocation + debt detail full width.

### Accounts (B04)
- Rate heatmap full width; summary stats + account alerts paired 3/2.

### Credit engine (B05) — schema + math + UI
- Schema (migration 0010, sanctioned path): `accounts.creditMode` (`panic`/`stooze`), `accounts.promoEndsAt`, `accounts.revertAprBps`; `accountTransactions.payoffPlan` (`immediate`/`over_time`), `plannedClearBy`, `allocatesToId`.
- Engine (`src/lib/server/credit-engine.ts`): `stoozeStatus` (clear-by = promo end − 5d buffer), `allocatePayments` (explicit allocations then earliest-deadline waterfall), `chargePlanStatus`/`chargeStatuses` (statement-delay horizon = last month-end; 3-month default targets; revert-APR flex cost), `cardSplitSummary`. 13 hand-computed unit tests.
- UI: `CreditModePanel` (mode switcher + promo-window form + stooze reminders — payoff pressure ONLY in panic mode) and `SplitsSection` (`[now]`/`[3mo]` per-charge plans, confirmed-through progress, per-month requirement, deadline, if-late cost).
- ADR: `.docs/design/2026-10-29-2025-credit-engine.md`.

### Data pipeline (B06) — ADR `.docs/design/2026-10-29-2040-data-pipeline.md`
- R15 judgment: transactions are round-trip editable (export → modify → reimport), not inline-editable; the unified engine IS the edit mechanism.
- Round-trip verification suite (7 tests): no-op exports, DROP+CREATE across accounts, cross-account moves, CSV quoting fidelity, category edits, preview/commit parity.
- Self-describing exports: `#` comment header with export timestamp, scope, per-account legend (`slug — name (type) — N rows`); `ExportPanel` with per-account checkboxes/context/filters.
- Expenses + income history CSV (`history-csv.ts`): 4-column format, upsert-by-month, idempotent deletes, kind-checked, backed-up; wizard + links on expenses/tax-income pages.
- Background queue (migration 0011 `import_jobs`): DataKey-sealed payloads, atomic job claims, coalesced worker chain, orphan sweep, thresholds route large files to the queue; `/api/import-jobs` + polling panel.
- Bulk bank import: Monzo layout auto-detection, date-format sniffing, column mapping UI, always-queued large files.
- Accounts CSV import: confirmed absent, pinned by a negative test (R21).

### Reports v2 (B07) & Tools (B08)
- `src/lib/server/reports-v2.ts` registry: net-worth-trajectory, savings-rate, interest-vs-allowance, credit-strategy, spending-profile, debt-horizon. Index = dated article list; paper template with ABSTRACT/METHOD/findings; figures by key; print + [ASCII] toggle; findings 2-col grid with figure spans.
- `src/lib/utils/tool-registry.ts`: 6 tools as sub-pages — rate what-if (per-account scenarios), overpayment (all-debts comparison), ISA optimiser (move-sources breakdown), compound projector (yearly milestones), stooze calculator (seeded from real cards), milestone projector (net-worth slope). New math parity-tested in `tool-math.ts`.

### Content digestibility (B09–B13)
- Budget: 4-cell summary strip (status/spent/pace/remaining incl. per-day math) + two-column body (progress + category targets | config + pace + burn-down + filters + amendments + history).
- Tax: finder cards 3-up on wide screens; wall-of-text broken into cards.
- Alerts: grouped, severity-badged, digestible (B11).
- Snapshots + routine: summary strips + checklist grids.

### Bills, payslips, DX (B14–B15)
- Bills page from recurring patterns + income-vs-deposits report; payslip processing judged (derived report first).
- Anonymiser verified end-to-end; agent runbook §9 extension surfaces.

### Cross-cutting
- Amber contrast pass app-wide (amber-600 → 700, 4.19:1 → 5.13:1 AA).
- Chart audit (R31): layerchart 2.8.1 remains the interactive layer (HistoryTrendChart); the 12 terminal charts stay hand-rolled print-safe SSR SVG by design; deferred chart P2s fixed (all-point ticks ≤6 snapshots, marker legend, wide-mode padding).

## Runbook

```bash
git switch release/ultimate-3.0
npm install            # deps unchanged (package.json locked all run)
npm run dev            # → http://127.0.0.1:5173  (admin / password)
```

- **Gates:** `npm run check` (0/0) · `npm test` (146 files / 1052 tests) · `npm run build` (adapter-node).
- **Schema:** migrations 0010 (credit engine) + 0011 (import_jobs) — both journaled (`__drizzle_migrations` hashes complete; `migration-journal-sync.test.ts` enforces). Dev DB path: `storage/dev-plain.db`. Re-seed: `npx tsx scripts/seed.ts --mode=standard` (fixtures include a panic card and a stooze card with promo window).
- **Credit modes:** account detail of any credit card → CREDIT STRATEGY panel (`[Pay off]` / `[Stooze 0%]` + promo window form). Splits tracker below it.
- **Data pipeline:** `/settings/data` (export w/ selection, reimport wizard, history import, job queue panel); bulk bank import from the data page.
- **Reports/Tools:** `/overview/reports` (index → six dated papers) · `/tools` (index → six sub-pages).
- **Architecture records:** `.docs/design/2026-10-29-2025-credit-engine.md` + `.docs/design/2026-10-29-2040-data-pipeline.md` · decisions ledger in `ULTIMATE-V3-PROGRESS.md`.
- **Audit evidence:** `.docs/reviews/2026-10-29-1916-ultimate-v3-audit/` (screenshots + vision verdicts, misreads adjudicated with DOM proof).

## Known state at time of writing

- All R1–R28 + addenda R29–R31 dispositioned `[x]`; 5/5 harvested R-H items implemented (R-H1 statement-backfill preset remains a logged speculative candidate).
- Remaining for the Definition-of-V3 gate: ledger ≥ 12h genuine work, final full-app zero-P0/P1 re-audit. (This section updates as the run continues.)
