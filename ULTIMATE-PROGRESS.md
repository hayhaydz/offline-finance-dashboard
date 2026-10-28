# ULTIMATE Release — Progress
Branch: release/ultimate-2.0 · Started: 2026-10-28T19:29+00:00

## Time ledger
| Session start | Session end | Elapsed | Work done |
|---|---|---|---|
| 2026-10-28T19:29 | | | bootstrap: branch, progress file, baseline, dev server |

## Master checklist
### Phase 0 — Bootstrap
- [ ] Branch `release/ultimate-2.0` confirmed (created from `main`)
- [ ] `ULTIMATE-PROGRESS.md` created; plan + progress committed as first commits
- [ ] Baseline `npm run check && npm test` recorded
- [ ] Dev server up; DevTools login admin; home snapshot clean

### Phase 1 — P0 fixes (each with regression test)
- [ ] P0-1: GoalDetailCard TDZ — reorder deriveds + SSR smoke test
- [ ] P0-2: ciphertext leak — passthrough renders `[encrypted]`; root-cause seed keyring
- [ ] P0-3: `[object Object]` error page — normalise thrown values
- [ ] Live-verify goal money flow end-to-end (create → add → detail → withdraw → detail) + vision

### Phase 2 — P1/P2 bugs + quick wins (#2–#10)
- [ ] P1-1 `<br>` PSA bars · P1-2 liabilities formatCurrency · P1-3 breadcrumb slugs/labels
- [ ] P1-4 debt milestone inversion + payment history · P1-5 shared goal-progress fn (tests) · P1-6 Newest-First toggle semantics
- [ ] P1-7 account-count consistency (closed-account policy) · P1-8 PaginationClient console.logs · P1-9 Ready-to-Assign semantics
- [ ] P2-1 breadcrumb capitalisation map · P2-2 styled delete-confirm modal · P2-4 ISA over-subscription warning · P2-5 copy nits
- [ ] #2 severity legend · #5 bar % labels + pace colours · #6 touched-on-input forms
- [ ] #7 overspend bar cap + hatched overflow + label · #8 sentence-case `[i]` notes · #10 alert acknowledge (schema + seed)
- [ ] Phase gate: check+test green; live pass goals/accounts/interest/liabilities/alerts + vision spot-checks

### Phase 3 — Medium proposals (#11–#20)
- [ ] #11 net-worth hero sparkline · #12 accounts flat-view + sticky header · #13 filter type-to-search + counts
- [ ] #14 category system (seed, inline create, auto-suggest, chip) · #15 uncategorised triage deep-link
- [ ] #16 bulk balance-update screen · #17 snapshot staleness dots · #19 ⌘K palette · #20 print/PDF monthly report
- [ ] Phase gate: check+test green; live pass new screens + vision review

### Phase 4 — Visualisation V1 (layerchart, Variant B)
- [ ] Chart foundation: shared theme, bordered panels, text-summary a11y line
- [ ] Net worth line (Home/Reports) · budget burn-down · goal bullet bars
- [ ] Charts from typed server loads; print-safe SVG
- [ ] Phase gate: vision review every chart

### Phase 5 — Reports module
- [ ] Index: net worth 1y/5y/all + assets-vs-liabilities stacked area
- [ ] Spending by category · interest report + PSA bullet · debt report (waterfall + projections)
- [ ] Per-chart PNG/SVG export + print stylesheet
- [ ] Phase gate: every report live-verified + vision

### Phase 6 — Tools module
- [ ] Rate-change what-if · overpayment simulator · ISA optimiser · compound projector
- [ ] Reuse server engines; client = presentation + inputs
- [ ] Phase gate: hand-verified math + vision

### Phase 7 — Keyboard-first + surface intelligence
- [ ] j/k nav, Enter open, `?` help overlay
- [ ] Rate heatmap · allocation view · cashflow calendar
- [ ] ASCII chart mode preference

### Phase 8 — Full re-audit
- [ ] `.docs/reviews/<ts>-ultimate-loop-audit/` created (README + findings + screenshots)
- [ ] Every route: live → screenshot → vision → console/network clean
- [ ] Findings severity-tagged; new P0/P1 fixed; P2s triaged
- [ ] Before/after vs original 63 screenshots

### Phase 9 — Deep polish (until Definition of Ultimate holds)
- [ ] Performance pass · a11y pass · code hygiene sweep
- [ ] Docs: runbook/CHANGELOG, VERSION_HISTORY save points
- [ ] Vision-sweep remaining pages; harvest + implement new ideas
- [ ] Ledger ≥ 6h verified

## Decisions
| Date | Decision | Rationale |
|---|---|---|

## Deferrals
| Item | Reason |
|---|---|

## Vision review log
| Date | Screenshot | Verdict |
|---|---|---|

## Notes for next iteration
- Created branch from main @ 8a67f0d. Working tree was clean. Audit dir + plan file already committed on main.
