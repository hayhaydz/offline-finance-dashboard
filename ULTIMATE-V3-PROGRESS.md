# ULTIMATE v3 Release — Progress
Branch: release/ultimate-3.0 · Base: release/ultimate-2.0 @ 6e34352 · Started: 2026-10-29T19:11:24+00:00

## Time ledger
| Session start | Session end | Elapsed | Work done |
|---|---|---|---|
| 2026-10-29 19:11:24 GMT | 2026-10-29 19:14:46 GMT | 0h 03m | Sweep 0: progress file, casing fix, check/test/build baseline, live login verified |
| 2026-10-29 19:16:01 GMT | 2026-10-29 19:22:50 GMT | 0h 07m | Sweep 1 B01: research/judge/plan/edit/self-review — full-viewport shell, no-wrap nav, top-bar fix |
| 2026-10-29 19:23:53 GMT | 2026-10-29 19:32:33 GMT | 0h 09m | Sweep 1 B02 batch 1: header revert + viz gallery + tests; §9 addendum (R29–R31) recorded |
| 2026-10-29 19:33:30 GMT | 2026-10-29 19:52:40 GMT | 0h 19m | R30 bento gallery redesign + vision fixes; never-stop override recorded |
| 2026-10-29 19:52:40 GMT | 2026-10-29 20:05:31 GMT | 0h 13m | R29 home two-column conversion + vision adjudication; B02 complete |
| 2026-10-29 20:05:31 GMT | 2026-10-29 20:16:11 GMT | 0h 11m | B03 goals: tick lines removed, full-width allocation + debt detail, live+vision |
| 2026-10-29 20:16:11 GMT | 2026-10-29 20:20:29 GMT | 0h 04m | B04 accounts first pass (R5+R29) + sweep 1 gate (check/test/build/vision) |
| 2026-10-29 20:20:29 GMT | 2026-10-29 20:22:15 GMT | 0h 02m | B05 design: research + architecture record + progress-plan |
| 2026-10-29 20:22:15 GMT | 2026-10-29 20:39:20 GMT | 0h 17m | Sweep 2 B05: schema+engine+mode UI+splits, gate passed |
| 2026-10-29 20:39:20 GMT | 2026-10-29 20:40:54 GMT | 0h 02m | B06 research + data pipeline ADR committed |
| 2026-10-29 21:49:32 GMT | 2026-10-29 22:23:03 GMT | 0h 34m | Sweep 3 B06 COMPLETE: S1 round-trip tests, S2 export header+panel, S3 history csv, S4 queue (schema 0011), S5 bulk Monzo import, S6 R21 guard; gate passed |
| 2026-10-29 22:23:04 GMT | 2026-10-29 22:34:00 GMT | 0h 11m | Sweep 4 B07 COMPLETE: reports v2 registry + template + index + 6 reports + tests; live + vision gate passed |
| 2026-10-29 22:34:01 GMT | 2026-10-29 22:40:08 GMT | 0h 06m | Sweep 4 B08 COMPLETE: tools index + 6 sub-pages + 2 new tools (stooze, milestones) + math tests; live gate passed |
| 2026-10-29 22:40:09 GMT | 2026-10-29 22:53:52 GMT | 0h 14m | Sweep 5 B09 COMPLETE: budget summary strip + two-column redesign; R-H4 bracket-link sweep (58 fixes, 29 files) + regression net |
| 2026-10-29 22:53:53 GMT | 2026-10-29 23:02:40 GMT | 0h 09m | Sweep 5 B10 COMPLETE: tax finder cards + threshold bars + mini-tables; vision gate (P1 rejected w/ evidence); suite 1051/1051 |
| 2026-10-29 23:02:41 GMT | 2026-10-29 23:06:30 GMT | 0h 04m | Sweep 5 B11 COMPLETE: alerts summary strip + severity lanes + badge fixes; vision P1s fixed same unit |
| 2026-10-29 23:06:31 GMT | 2026-10-29 23:10:22 GMT | 0h 04m | Sweep 5 B12+B13 COMPLETE: snapshots + routine summary strips, checklist grid; suite 1051/1051 |
| 2026-10-29 23:10:23 GMT | 2026-10-29 23:17:00 GMT | 0h 07m | Sweep 6 B14+B15 COMPLETE: bills page + income-vs-deposits report; anonymiser verified; runbook §9; suite 1051/1051 |
| 2026-10-29 23:17:01 GMT | 2026-10-29 23:21:33 GMT | 0h 05m | Sweep 7 harvest: R-H2+R-H3 (report grid + ascii toggle), R-H5 (tax 3-up), R-H8 (amber AA); badge-count mismatch disproven |
| 2026-10-29 23:21:34 GMT | 2026-10-29 23:27:09 GMT | 0h 06m | Sweep 7 vision re-audit: report grid P0 + monotonic-label P1 + ascii width fixed; suite 1052/1052; build green |
| 2026-10-30 08:39:20 GMT | 2026-10-30 08:55:22 GMT | 0h 16m | Sweep 8 open: R31 audit+chart fixes, release doc, R29 account detail, double-bracket residue fixed |

## Sweep 0 — Bootstrap (COMPLETE)
- [x] Progress file created with §7 contract structure, R1–R28 disposition, block registry, Appendix C pre-seeded decisions. ev: commit `933c3e7`
- [x] Containment self-check: `.opencode/opencode.json` present with `external_directory` deny-all + allows (temp dir, main checkout RO); shell deny-list (sudo/rm -r/git -C/worktree/reset --hard/etc.) intact. ev: file read at block start 19:11 GMT; ports 5173/4173 clear
- [x] Baseline `npm run check` 0 errors / 0 warnings. ev: "svelte-check found 0 errors and 0 warnings" after commit `24890ed` (casing fix — see Decisions)
- [x] Baseline `npm test` — 135 files / 983 tests ALL GREEN (matches v2 exit state exactly). ev: "Test Files 135 passed (135), Tests 983 passed (983)" @ 19:13:21
- [x] Baseline `npm run build` green. ev: "✓ built in 10.74s" + adapter-node "✔ done"
- [x] Dev server up from worktree + live login (admin/password) verified via CDP: `/` → `/login?reason=logged-out` → login → back to `/`. Console 0 errors (vite debug only), network 112 reqs, 0 5xx. ev: CDP list_console_messages/list_network_requests output 19:14 GMT

## Requirements disposition
| Req | Status | Evidence / decision |
|---|---|---|
| R1 | [x] (B01 shell) | ev: commits b6acfe5+c8f0502; shell 1584×984 @1600×1000, internal scroll, meta width=1280, nav rows flex-nowrap. Page-level inner max-w wrappers handled per-block (B02–B04) — shell-level R1 holds |
| R2 | [x] | Already satisfied by v2: hooks loginRedirect covers `/` → `/login?reason=logged-out&redirectTo=%2F`; login page renders "You have been logged out. Data is sealed." + login form + [Register] = clear path. ev: Sweep-0 CDP snapshot uid=1_14 + B01 research #6 |
| R3 | [x] | ev: header reverted (no sparkline in NetWorthDisplay, live); viz gallery below header — bento grid of switchable-sized cells with click-to-expand (R3 interaction preserved); commits ba5073f+307e48d+9f458e0 |
| R4 | [x] | ev: commit ebef83b; tick lines stripped from DebtCard/GoalCard/GoalRow (bars pre-v2 form); DOM tickLines:0; vision "plain progress bars with no vertical tick marks"; textual 1mo/3mo labels + milestone data model kept (pre-v2 features) |
| R5 | [x] | ev: commit 5f10731; heatmap max-w-3xl removed — panel 1582px live @1600 viewport; vision "full width… no visual defects" |
| R6 | [x] | ev: goals allocation + debt detail max-w wrappers removed; DOM 1582px panels live; vision confirms full width |
| R7 | [x] | ev: CreditModePanel + setCreditMode; payoff UI gated to panic mode (live-verified stooze shows reminders only, panic shows projection); design record .docs/design/2026-10-29-2025-credit-engine.md |
| R8 | [x] | ev: SplitsSection [now]/[3mo] per-charge plans + setPayoffPlan; over-time cost = revert-APR flex cost shown per charge; live toggle verified |
| R9 | [x] | ev: budget summary strip (4 cells) + two-column body; commit e09a288; live gridCols 3 + summary cells; SSR test 3/3; vision P0 none |
| R10 | [x] | ev: reports v2 — registry + science-paper template + dated article index + 6 launch reports (net-worth, savings-rate, interest-PSA, credit-strategy, spending-profile, debt-horizon); all live 200 w/ ABSTRACT+METHOD; commit 4886287; tests 1043/1043 |
| R11 | [x] | ev: finder years as cards w/ threshold bars + arithmetic mini-tables; commit 32df8b4; live 3 cards/bars/mini-rows; vision 0 P0 (math P1 rejected w/ source evidence) |
| R12 | [x] | ev: severity summary strip + severity lanes (red|amber|info side by side); commits 5cd73f1+eac0fab; live 3/3 aligned; vision 0 P0 after fixes |
| R13 | [x] | ev: tools index + 6 sub-pages (4 deepened + NEW stooze calculator + NEW milestone projector); hand-computed math tests; all live 200; commit 04a7e65 |
| R14 | [x] (B06) | ev: overhaul = unified DATA PIPELINE surface (export selection → history CSV → bulk bank import → reimport → jobs queue, one page, one engine) + ADR .docs/design/2026-10-29-2040-data-pipeline.md; no rewrite of v2's tested engine (100+ tests kept, 30+ added) |
| R15 | [x] | ev: DECISION recorded (round-trip replace via import, NOT inline edit — Matrixify DROP/CREATE model) + imports-roundtrip.test.ts 7 tests pin cross-account DROP+CREATE/MOVE; in-file reimport hints shipped in every export header |
| R16 | [x] | ev: DOM proof single-bracket `[⌘K]`/`[?]` (text + pseudo-elements); top bar de-crowded (right-clustered controls, gap-4); a11y names `[⌘K]` `[?]`; palette open/close live-verified |
| R17 | [x] | ev: ALL five legs done — tax (B10 cards+bars), snapshots (B12 strip), accounts/liabilities (B04 first pass R5+R29), routine (B13 strip+grid), budget (B09 strip+two-col); commits 32df8b4+ca24496+5f10731+e09a288 |
| R18 | [x] | ev: self-describing export header (ts/scope/account legend) + ExportPanel with per-account type/rows/coverage context + filters; commit d476211; live legend verified |
| R19 | [x] | ev: round-trip verified across 2 accounts from real exports (drop/create/move) — imports-roundtrip.test.ts 7/7 |
| R20 | [x] | ev: engine statement-delay horizon (confirmed-through last month-end) + 3-month targets + waterfall payment allocation; 13 hand-computed tests; live tracker rows with on-track/behind |
| R21 | [x] | ev: absent app-wide, pinned by tests/integration/accounts-import-absent.test.ts (3 tests); commit 177c2d8 |
| R22 | [x] | ev: import_jobs queue (schema 0011 sanctioned path) + sealed payloads + atomic claim + orphan sweep + /api/import-jobs + polling panel; >1MB tx / >200KB history commits auto-queue; 6 tests; commit c5ed2b2 |
| R23 | [x] | ev: history-csv.ts engine both kinds export+import, /api/history/export, wizard, page links; 10 tests incl. backup restore + isolation; commit 7884a49 |
| R24 | [x] | ev: DECISION derived report first (no import); income-vs-deposits report live (declared vs deposit evidence, gap flags); commit 25e72c7 |
| R25 | [x] | ev: DECISION derived patterns (DD-vs-invoiced invisible in data); /overview/bills live w/ summary strip + next-due; commit 25e72c7 |
| R26 | [x] | ev: bulk-import.ts Monzo-preset column mapping (web-verified layout) + BulkImportWizard + queue integration; 7 tests; commit 177c2d8 |
| R27 | [x] | ev: CLI verified end-to-end 2026-10-29 (admin→elmsworth.quarry79, structure preserved, self-check PASS); import_jobs rules added S4 |
| R28 | [x] | ev: runbook §9 v3 extension surfaces (registries, pipeline, schema path, gotchas); commit 3310fec |
| R29 | [x] (home) | ev: commit a9a0d92; home converted to 3/2 two-column rows, DOM-verified 936/622px, vision "conversion succeeds". App-wide R29 continues per-block (B03/B04 next) |
| R30 | [x] | ev: commits 307e48d+9f458e0+e0a77b8; untitled bento grid live (trend col-span-2 1041px / allocation col-span-1 517px, panels aligned 269/269), wide-aspect 900×180 chart, [+] expand cycle verified, vision re-review clean of prior P1s |
| R31 | [x] | AUDIT COMPLETE 2026-10-30: layerchart 2.8.1 confirmed the interactive layer (HistoryTrendChart pattern: client-only, mono-wrapped, series/tick config) and stays the designated library for new interactive axis charts. The 12 terminal charts stay hand-rolled BY DESIGN: print-safe static SSR SVG, deterministic, test-pinned, aesthetic-locked — migrating to a client-only measuring library would regress print+SSR for hover alone. Deferred chart P2s fixed in-unit (commit 720f033): all-point ticks ≤6 snapshots (no skipped months), marker-colour legend (■rise/■fall/■latest), wide-mode right padding. ev: 1052/1052 green incl. 17 chart tests |
| R-H* | 5/5 done | R-H2 ascii toggle ✓ R-H3 findings grid+full-width ✓ R-H4 bracket sweep+net ✓ R-H5 tax 3-up ✓ R-H8 amber contrast ✓ (commits de46c48+1fe28c8+e09a288); R-H1 statement-backfill stays logged (speculative) |

## Block registry
| Block | Last sweep | BLOCK CYCLE stage | Notes |
|---|---|---|---|
| B01 SHELL & VIEWPORT | 1 | COMPLETE (sweep 1) | R1 R2 R16 ticked; shell full-viewport; residual: page-level max-w wrappers → B02/B03/B04 |
| B02 HOME | 1 | COMPLETE (sweep 1) | R3 ✓ R29(home) ✓ R30 ✓; chart-internal P2s → R31 |
| B03 GOALS | 1 | COMPLETE (sweep 1) | R4 ✓ R6 ✓; bulletbar keeps tick capability (unused); deeper R29 grid pass when B03 revisited |
| B04 ACCOUNTS & LIABILITIES | 1 | FIRST PASS (sweep 1) | R5 ✓ R29(accounts) ✓; R17 deeper work → sweep 5 |
| B05 CREDIT & STOOZING | 2 | COMPLETE | R7 ✓ R8 ✓ R20 ✓; architecture record in .docs/design/ |
| B06 DATA MANAGEMENT | 3 | COMPLETE (sweep 3) | S1–S6 all [x]; R14 R15 R18 R19 R21 R22 R23 R26 ticked; ADR + 30 new tests; queue candidates surveyed (statement imports, backfills — left inline deliberately) |
| B07 REPORTS v2 | 4 | COMPLETE (sweep 4) | R10 ✓; 6 reports live; density P2 → R29 pass later; ASCII toggle → R-H2 |
| B08 TOOLS | 4 | COMPLETE (sweep 4) | R13 ✓; 6 tools as sub-pages; registry at src/lib/utils/tool-registry.ts — add tool = component + registry entry + [slug] branch |
| B09 BUDGET | 5 | COMPLETE (sweep 5) | R9 ✓ R17(budget) ✓; R-H4 harvested+implemented (58 bracket-link fixes + regression net) |
| B10 TAX | 5 | COMPLETE (sweep 5) | R11 ✓ R17(tax) ✓; P2 dead-space → R29 polish |
| B11 ALERTS | 5 | COMPLETE (sweep 5) | R12 ✓; lanes aligned to strip; badge truncation fixed |
| B12 SNAPSHOTS | 5 | COMPLETE (sweep 5) | R17(snapshots) ✓; summary strip |
| B13 ROUTINE | 5 | COMPLETE (sweep 5) | R17(routine) ✓; strip + checklist grid |
| B14 BILLS & PAYSLIPS | 6 | COMPLETE (sweep 6) | R24 ✓ R25 ✓; bills derived-pattern page + income-vs-deposits report |
| B15 DX & AGENT TOOLING | 6 | COMPLETE (sweep 6) | R27 ✓ R28 ✓; anonymiser verified; runbook §9 |
| B16 CROSS-CUTTING | 7 | ACTIVE | harvest sweep 7 running: 5 R-H implemented ≥ gate; a11y pass done; next: fresh full-app vision audit + P2 triage |

## Per-block research & judgments
### B01 SHELL & VIEWPORT (Sweep 1)
- research:
  1. Outer container: `+layout.svelte:54` `<div class="border border-black max-w-4xl mx-auto w-full">` — the R1 max-width container. Body `app.css:56` `px-4 py-6 md:px-8 md:py-12`. `.scrollable-content` = `max-height: calc(100vh - 200px); overflow-y: auto` (app.css:94) — design intent is already an internal-scroll terminal window.
  2. R16 root cause CONFIRMED: `bracket-link` utility (app.css:25) renders `::before '['` + `::after ']'`, and the top-bar buttons hardcode literal `[⌘K]` (+layout.svelte:72) and `[?]` → `[[⌘K]]` / `[[?]]`. The `[!] DEV DATA [!]` span has no bracket-link class — renders fine.
  3. Top strip contents: OFFLINE-FINANCE-v0.exe / USER: X / [ MODE: … ] / [!] DEV DATA [!] / ⌘K / ? — 6 items on `justify-between`; crowding was a symptom of the 896px container.
  4. Nav rows: `navigation.svelte:233,263` use `flex flex-wrap` — the rows R1 says must not fold. 30 flex-wrap instances app-wide; most are legend/form chips where wrap is harmless — judgment: fix the two nav rows now, audit the rest per-block in later sweeps.
  5. Viewport meta `app.html`: `width=device-width, initial-scale=1` — must become a fixed desktop width so mobile = zoomed-out desktop (R1).
  6. R2: hooks.server.ts `loginRedirect("logged-out")` covers `/` (line 135 no-cookie path, 164 dead-session path) → `/login?reason=logged-out&redirectTo=%2F`; login page renders "You have been logged out. Data is sealed." (snapshot uid=1_14, Sweep 0) with the login form + [Register] right there = clear path to log in. R2 appears FULLY satisfied by v2 already.
  7. Test pins: `command-palette-ssr.test.ts:24` expects `[⌘K] toggle` — that string lives INSIDE CommandPalette.svelte:147 as literal hint text (no bracket-link class) → untouched by top-bar fix. `list-nav-help-overlay.test.ts:87` expects body contains `⌘K` → still true after fix (button text `⌘K`, brackets via CSS).
  8. Inner page-level max-w wrappers exist (home `max-w-3xl`, balances/uncategorised/debt `max-w-4xl mx-auto`, tools/reports grids `max-w-6xl`) — belong to B02/B03/B04 sweeps, noted there.
- judgments:
  1. Full-viewport via flex-column shell: outer div becomes `h-[calc(100vh-1rem)] flex flex-col` (body p-2), `.scrollable-content` becomes `flex-1 min-h-0 overflow-y-auto` — robust against variable chrome height (banner/subnav/breadcrumb), keeps pinned-chrome + internal-scroll terminal window. Print media overrides height/overflow to visible.
  2. Body padding `px-4 py-6 md:px-8 md:py-12` → `p-2` (thin frame so the black border reads as a maximized terminal window).
  3. Viewport meta → `width=1280` (phones render the 1280px desktop layout scaled-to-fit = "zoomed-out view of the desktop").
  4. Nav + subnav rows → `flex-nowrap` + `overflow-x-auto` (rows never fold; graceful horizontal scroll under 1280px desktop windows).
  5. Top bar: strip literal brackets from ⌘K and ? buttons (CSS supplies them); group the two buttons in a right-side cluster with gap; keep [!] DEV DATA [!] literal (status, not a link).
  6. R2 = already satisfied (no code): tick with Sweep-0 live evidence + this research.
- PLAN (this batch, ≤5 units):
  - [x] U1 viewport meta `app.html` → width=1280 (R1c). ev: live DOM `viewportMeta:"width=1280"` @1600×1000 CDP window
  - [x] U2 shell full-viewport flex column (+layout.svelte + app.css scrollable-content + print) (R1a/b). ev: commit `b6acfe5` + `c8f0502`; live metrics shell 1584×984 in 1600×1000 window, `mainInternal:[true]`, `docHScroll:false`
  - [x] U3 nav/subnav rows no-wrap (navigation.svelte) (R1d). ev: commit `b6acfe5` (flex-nowrap + overflow-x-auto, both rows)
  - [x] U4 top bar double-bracket fix + de-crowd (+layout.svelte) (R16). ev: DOM proof `text:"⌘K"` + `::before "["` `::after "]"` → renders `[⌘K]` once; buttons clustered right with gap-4 layout
  - [x] U5 gate: check 0/0; targeted palette tests 15/15; full suite 983/983 (×2 green after 1 documented first-run flake); live `/` console 0 errors / 0 5xx; palette opens from fixed button + Escape closes; vision review no P0/P1 (see log)

### B02 HOME (Sweep 1)
- research:
  1. v2→home diff vs `main`: (a) `trend={data.netWorthTrend}` prop on NetWorthDisplay = the v2 header chart (sparkline, renders only `{#if trend.length > 1}` — component auto-reverts when prop absent); (b) standalone CashflowCalendar block below IsaAllowanceWidget inside `max-w-3xl` wrapper; (c) 2× text-gray-400→500 contrast fixes; (d) `milestones` prop to GoalCard (that is B03/R4, not touched here).
  2. Chart inventory (12 components, all ChartPanel-framed with export + a11y summary): NetWorthChart (full trend line), CashflowCalendar, AllocationBar (ink-density stacked composition bar via allocationShares), MonthlySpendChart, StackedAreaChart, etc.
  3. Home load already provides everything a gallery needs: `netWorthTrend`, `cashflow {year,month,obligations}`, `accounts` (→ accountsByType asset groups for allocation).
  4. Tests: no test pins home trend/sparkline/cashflow rendering (charts-empty-data-ssr + surface-views-ssr exercise the components themselves — unaffected by relocation).
- judgments:
  1. Header revert = stop passing `trend` to NetWorthDisplay (guard reverts render; no component edit). Keep `netWorthTrend` in load — the gallery consumes it.
  2. v2's trend chart SURVIVES as gallery view #1 (relocate, don't delete — Appendix C revertibility decision).
  3. NEW `HomeVizGallery.svelte` below the header stack: bracket-link switcher `[Trend] [Cashflow] [Allocation]`, one view at a time, full width, default Trend; Cashflow option hidden when no obligations; Allocation view = AllocationBar over asset account-type groups ("where the money sits").
  4. Remove standalone CashflowCalendar block + its max-w-3xl wrapper (superseded by gallery view #2).
  5. KEEP v2's gray-500 contrast fixes (a11y improvement, unrelated to the header chart).
- PLAN (this batch, ≤5 units):
  - [x] U1 home header revert (drop trend prop + CashflowCalendar block/import). ev: commit `ba5073f`; live `netWorthSparklineInHeader:false`
  - [x] U2 create HomeVizGallery.svelte (3 switchable views). ev: commit `ba5073f`
  - [x] U3 wire gallery below header stack; npm run check 0/0. ev: check output "0 errors and 0 warnings"
  - [x] U4 unit test for gallery (SSR default view, hidden-empty tabs, empty-trend fallback, all-empty nothing) — 4/4 green; found + fixed dead trendSummary + SSR-inert $effect fallback (derived `effective` instead). ev: commit `60f3f52`; full suite 987/987
  - [x] U5 gate: live `/` — tabs render (Trend selected, Cashflow hidden: no obligations in dev data), click-switch Trend→Allocation→Trend works, console 0 errors, 0 5xx. VISION DEFERRED to the R30 bento redesign (surface changes again immediately — vision pass there). ev: CDP evaluate output above
- **IN FLIGHT — R30 redesign queue (next batch, from §9 addendum):** remove VISUALISATIONS title entirely; shrink chart scale; bento grid of different-sized cells (no single tall stack); R29 multi-column thinking for the rest of home afterwards.
- R30 DONE (2026-10-29 19:52 GMT):
  - [x] Untitled bento grid (`grid-cols-3`): trend `col-span-2`, allocation `col-span-1`, cashflow `col-span-3` when present. ev: commits `307e48d`,`9f458e0`,`e0a77b8`; live DOM grid `grid grid-cols-3 gap-2`
  - [x] Compact wide-aspect trend chart (`aspect="wide"` → 900×180 viewBox) fills its cell — no more oversized tall chart. ev: live `svgViewBox:"0 0 900 180"`, cell 1041×269
  - [x] Click-to-expand kept (R3 interaction survives): `[+]`/`[−]` per cell via forwarded `controls` snippet → col-span-3. ev: live expand/collapse cycle col-span-2↔3, aria-expanded toggles
  - [x] Vision P1s from bento v1 fixed: dead gap (was my max-w cap — removed), ragged bottoms (ChartPanel now `h-full flex flex-col` + `mt-auto` summary — panels measure 269/269 aligned), `[[SVG]]`/`[[PNG]]` double brackets (literal brackets removed from ChartPanel; CSS supplies one pair — same fix class as ⌘K; tests updated chart-panel-ssr + chart-export-ssr). ev: commit `e0a77b8`; DOM text `SVG`/`PNG` + one pseudo-bracket
  - [x] Vision P1-3 (caption delta wrong) REJECTED with arithmetic: aria-label delta −£1,056.11 = latest(−7,040.75) − first(−5,984.64) exactly; vision read the 5%-padded y-max label (−5,931.83) as a data point (its figure −1,108.92 = −7,040.75 − (−5,931.83), precisely that error). ev: aria-label string + solve yHi = maxV + 0.05·range = −5,931.83 ✓
  - [x] P2-3 copy bug fixed: AllocationBar summary noun parameterised (`noun` prop, default "goals"; gallery passes "asset classes"). P2 triage: x-axis tick spacing + marker-colour legend + end-label crowding = NetWorthChart internals → folded into R31 (chart package upgrade) not hand-rolled polish. ev: commit `e0a77b8`
  - Gate: check 0/0; full suite 988/988; live `/` console 0 errors / 0 5xx; vision re-review: 3 of 4 previous defects verified fixed + ragged-bottom fix then DOM-confirmed (269/269)
- R29 home pass (2026-10-29 19:56 GMT): 1-column bands → sized 2-column rows via `grid-cols-5` (3/2 splits): TaxYearProgress|IsaAllowance, INTEREST|ALERTS, ACCOUNTS|GOALS; conditional spans when data absent; `[&>*:last-child]:border-b-0` wrapper trick avoids editing shared components. ev: commit `a9a0d92`; DOM rows 936/622px ×3; vision "conversion succeeds… no P0… full width used well". B02 COMPLETE (R3+R29+R30 for home).
- Vision P1 rejections (both chart-footer claims): delta −1,056.11 = −7,040.75 − (−5,984.64) exact (vision misread the 5%-padded y-max label −5,931.83 as a data point, 2nd occurrence); endpoint "-£7,040.75" minus IS present in DOM text node. P2 triage: chart-internal items → R31; row1 dead-space centering + contrast bumps → later polish; alerts 27 vs 21 badged → verify in B11. Row 4 beyond viewport in shot — DOM-verified 936/622×1060; vision check folded into sweep gate.

### B03 GOALS (Sweep 1)
- research: milestone tick LINES are v2's "Phase 4 V1 #3" system (util goal-milestone-ticks + DebtCard/GoalCard/GoalRow/GoalBulletBar/GoalDetailCard rendering); pre-v2 bars had NO tick lines but DID have textual 1mo/3mo/6mo/12mo labels (kept); R6 offenders: goals allocation `max-w-3xl`, debt detail `max-w-4xl`.
- judgments: remove tick-LINE rendering from all bar components; keep milestone data + textual labels (pre-v2 features); GoalBulletBar keeps tick capability but GoalRow stops passing ticks (plain default); R6 wrappers removed; bulletbar SSR tests stay (component capability unchanged).
- units (all [x]):
  - [x] U1 strip tick lines from DebtCard (+ home call site milestone prop). ev: commit `ebef83b`; DOM tickLines:0 on /goals
  - [x] U2 strip tick lines from GoalCard + GoalRow (textual labels kept). ev: vision "plain progress bars with no vertical tick marks"
  - [x] U3 R6 width: goals allocation panel 1582px live; debt detail `p-4 w-full` 1582px live
  - [x] U4 gate: check 0/0; 988/988; live /goals (10 rows, 10 plain bars, clean console/network) + /goals/debt/clear-mastercard (0 ticks, full width, clean). Gotcha: /goals/debt/pay renders "Debt goal not found" error page — breadcrumb artifact, not a real slug
  - [x] U5 recorded; R4 + R6 ticked in disposition

### B04 ACCOUNTS & LIABILITIES (Sweep 1 — first pass)
- research: RateHeatmap wrapper `max-w-3xl mt-3` (accounts/+page.svelte:448); page structure NetWorthDisplay → SUMMARY band → ACCOUNT ALERTS band → table → heatmap; TaxYearProgress/IsaAllowanceWidget imported but NOT rendered here (imports unused? — no, accounts renders IsaAllowanceWidget elsewhere; verified via grep earlier: accounts/+page.svelte uses IsaAllowanceWidget).
- R5+R29 pass (2026-10-29 20:19 GMT): heatmap max-w removed (panel 1582px live); SUMMARY stats + ACCOUNT ALERTS paired 3/2 (936/622 live) with empty-state cell when no accounts. ev: commit `5f10731`; console 0 err / 0 5xx; vision "implemented without visual defects" (heatmap full width, columns aligned, P0 none).
- R17 deeper work (closed/open presentation, liabilities surface) — deferred to Sweep 5's dedicated weaker-area pass per plan §6.3; NOT forgotten: tracked in registry.

### B05 CREDIT & STOOZING (Sweep 2 — COMPLETE)
- design: `.docs/design/2026-10-29-2025-credit-engine.md` (research: Monzo Flex Pay-in-Full/Pay-in-3 semantics; stoozing conventions)
- units (all [x]):
  - [x] U1 schema via sanctioned path: accounts += creditMode/promoEndsAt/revertAprBps, accountTransactions += payoffPlan/plannedClearBy/allocatesToId; migration 0010 applied to dev-plain.db; journal hash f2ecbf7c… inserted (migration-journal-sync green); seed.ts + fixtures updated (Visa Gold=panic/23.9%, Mastercard=stooze/promo 2027-01-15/24.9%) + anonymiser TABLE_RULES extended (its drift guard caught all 6 columns — worked as designed). ev: commit `ea4422a`
  - [x] U2 engine `src/lib/server/credit-engine.ts`: stoozeStatus (clear-by = promo−5d), allocatePayments (explicit→waterfall earliest-deadline), chargePlanStatus/chargeStatuses (statement-delay horizon = last month-end, 3-month target, revert-APR flex cost), cardSplitSummary (single shared allocation, no double counting), defaultClearBy. 13 hand-computed unit tests (3 initial failures were MY test-arithmetic slips — engine correct; e.g. 40k−30k=10k to c1, Sep10+3mo=Dec10). ev: commit `fc36232`; 13/13 green
  - [x] U3 mode toggle + panels: CreditModePanel ([Pay off]/[Stooze 0%]/[Clear] + promo-window form), setCreditMode + setPromoWindow actions; DebtProjectionSection now renders for credit cards ONLY in panic mode (R7). ev: commits `1250142`,`34bb6f7`; live: stooze reminders "0% ends 2027-03-15 (136 days) · have £450.00 ready · pay by 2027-03-10" + NO payoff UI; panic → projection returns
  - [x] U4 SplitsSection (R8 R20): per-charge [now]/[3mo] toggle (setPayoffPlan; over_time defaults clear-by +3mo), confirmed-through-last-month-end progress, per-month requirement (immediate = "next statement"), deadline, if-late cost at revert APR. ev: commits `f19fae0` + display fix; live toggle £650→£325×2mo verified, "behind" badge correct (£150/£800 vs 2mo elapsed)
  - [x] U5 gate: check 0/0; 1001/1001 (137 files); build green; live Mastercard flow (stooze→promo→reminders→panic→3mo toggle) console 0 errors / 0 5xx; vision P0 none ("high-quality, functional terminal rendering"). ev: outputs above + v3-b05-credit-1600.png
- research:
  1. Schema today: accounts have creditLimit + minimumPayment rules; transactions have charge/payment/interest_charge types; NO promo/mode/plan concepts (src/lib/db/schema/accounts.ts).
  2. Monzo Flex (web, monzo.com + community): Pay in Full / Pay in 3 interest-free; 6/12 carry fee/interest; can switch to interest-free before first payment; cards set a DEFAULT plan — validates per-transaction plans + card default.
  3. Stoozing convention: 0% balance parked while savings earn; clear just before promo end (clear-by date a few days early for payment clearing).
- design: `.docs/design/2026-10-29-2026-2025-credit-engine.md` — per-account creditMode panic|stooze (Appendix C), card-level promoEndsAt + revertAprBps, per-transaction payoffPlan immediate|over_time + plannedClearBy (3-month target), payment allocatesToId waterfall, statement-delay as engine input (confirmed-through = last month-end), pure-function engine + hand-computed tests, mode-switched panels (panic = existing DebtProjectionSection; stooze = reminders, no pressure).
- PLAN (next units):
  - [ ] U1 schema via sanctioned path (accounts + accountTransactions columns, db:generate → SQL → dev-plain.db → journal hash → seed.ts same unit)
  - [ ] U2 credit-engine.ts + unit tests (hand-computed matrix in design record)
  - [ ] U3 account detail: mode toggle + panic/stooze panels (DebtProjectionSection only in panic)
  - [ ] U4 transactions: plan badges + over-time cost + split tracker (R8+R20)
  - [ ] U5 gate: check/test/build + live + vision + record

### B06 DATA MANAGEMENT (Sweep 3 — COMPLETE)
- research: v2 ALREADY has a unified reimport engine (insert/edit/delete one file, preview→commit + before-backups) = the Matrixify round-trip; export selection (accounts/from/to/type) exists; expensesHistory has NO csv (R23 gap); no queue infra (R22 gap); accounts-import ALREADY ABSENT app-wide (R21 → verify + close). ADR: `.docs/design/2026-10-29-2040-data-pipeline.md`
- KEY JUDGMENT (R15): transactions are round-trip editable via export→modify→reimport (NOT inline) — lean into the existing engine; verify DROP+CREATE cross-account with round-trip tests (S1) rather than building a second mechanism. DONE — engine proved; decision implemented as the product surface (wizards + docs in-file).
- S1 R19+R15 round-trip verification — `src/lib/server/imports-roundtrip.test.ts` 7 tests: unmodified multi-account export = no-op (all skipped, no backup); DROP in A + CREATE in B from a real export; cross-account MOVE (drop A + id-less create B, counts preserved); RFC-4180 comma/quote fidelity through export→edit→reimport; category edit round-trip by name; preview/commit parity. All PASS first run (engine was already correct — now pinned). ev: commit `2691abe`
- S2 R18 self-describing export — `#` comment header (export ts, scope line, per-account legend `slug — name (type) — N rows`, reimport hint) ignored by parser (export stays a valid reimport file); ExportMeta in buildTransactionsCsv/exportTransactionsCsv; ExportPanel component (account checkboxes w/ type+rows+coverage context, from/to/type filters, live-composed URL, ~rows indicator); page load gains per-account txCount/firstDate/lastDate. ev: commit `d476211`; live export 200 w/ legend lines `# account: … — ISA Saver (savings) — 23 rows`; tests exports.test.ts + export-panel.test.ts + roundtrip (comment-aware dataLines helper)
- S3 R23 expenses+income history CSV — new engine `history-csv.ts` (4-col `month,amount,note,_delete`; upsert-by-month, _delete→unknown, DELETE-if-exists idempotent skip, dup-month refusal, kind comment `# kind:` + mismatch refusal, plaintext pre-state backup in shared backupDir = same protection level as DB column); `/api/history/export?kind=`; HistoryImportWizard (preview→confirm→result, kind auto-picked from file); export+import links on /overview/expenses + /overview/tax/income; 10 hand-computed tests incl. both kinds, backup restore, cross-user isolation. ev: commit `7884a49`
- S4 R22 background queue — schema 0011 `import_jobs` (slug nanoid21, kind, status, sealed payload, rows_total, error, counts, timestamps; 2 indexes) via sanctioned path (SQL applied to dev-plain.db, journal hash f75b1f46… inserted, journal-sync test green, anonymiser TABLE_RULES entry); engine `import-jobs.ts` (DataKey-sealed payload AAD-bound to slug, atomic claim `UPDATE…WHERE id=(SELECT…) RETURNING`, worker-chain (coalesced runs — fixed my own boolean-guard race caught by tests), orphan sweep >10min, dispatch to commitReimport/commitHistoryImport); thresholds tx>1MB, history>200KB route to queue in actions; `/api/import-jobs` + ImportJobsPanel (2s polling while active); queued-banners in both wizards. 6 tests (sealed-at-rest, counts, refusal error, ownership isolation, thresholds, inline/queue parity). ev: commit `c5ed2b2`
- S5 R26 bulk bank import — `bulk-import.ts`: analyzeBankCsv (header sniff, Monzo layout detection, date-format detection uk/iso, best-effort mapping) + transformBankCsv (sign→deposit/withdrawal, dd/mm/yyyy→ISO, category passthrough only if user owns it, £0 skipped, notes fallback description); Monzo columns verified via web research (transaction_id,date,time,type,name,emoji,category,amount,… dd/mm/yyyy); parseCsvDocument in csv-format.ts is quote-aware across embedded newlines (bank notes wrap); BulkImportWizard (upload→analyze→map UI with per-column selects→transform→preview→commit); bulk files ALWAYS queue when > threshold; dedicated bulk-preview/bulk-commit actions (state isolation from ReimportWizard). 7 tests incl. full Monzo fixture → engine round-trip. ev: commit `177c2d8`
- S6 R21 negative test — `tests/integration/accounts-import-absent.test.ts` (actions key scan, app-wide source pattern scan w/ word-boundary regex that ignores ES `import Account…` statements, wizard render never offers account creation). 3 tests green. ev: commit `177c2d8`
- GATE: check 0/0 ✓ · full suite 1038/1038 (141 files) ✓ · build green ✓ · live /settings/data: all 6 sections render, console 0 errors / 0 5xx ✓ · endpoints live: export 200 (107 rows + legend), history export 200 both kinds, bogus kind 400, filtered export 200 (9 rows), jobs API 200 ✓ · vision: no P0 (P1s adjudicated below-fold artifacts — filters/steps DOM-verified; `[*K]` = documented ⌘K misread; Session&Security nav overlap noted for B01 later sweep). ev: outputs above + v3-b06-data-1600.png
- gotchas recorded: take_screenshot param is `filePath` not `filename` (silent no-op otherwise — cost 10 min); SQLite CURRENT_TIMESTAMP default → Invalid Date on drizzle integer-timestamp read-back (pass explicit Date()s — same reason upsertMonth does); zai free endpoint 1305-overloaded globally tonight → zai-vision MCP fallback worked first try.

### B07 REPORTS v2 (Sweep 4 — COMPLETE)
- research: old /overview/reports = ONE chart overview (net worth + stacked area + monthly spend + category bars + PSA bullet + debt waterfall, range pickers + ASCII mode) — exactly the "one overview" R10 rejects; engines beneath it are rich (reports.ts: netWorth/monthlySpend/interest/debt; credit-engine; expenses/income history; tax bands).
- judgments: registry-driven report system — each report a focused question, dated, science-paper STRUCTURE (title/abstract/method/findings) inside terminal aesthetic (Appendix C decision); auto-written abstracts carry real numbers; figures reuse existing chart components by key; index = dated article list (news style); old chart surfaces get homes as reports (spend → spending-profile, debt → debt-horizon).
- units (all [x]):
  - [x] U1 registry `src/lib/server/reports-v2.ts` — ReportDoc (slug/title/date/abstract/method/findings/figures+data), ReportDefinition[]; 6 builders: net-worth-trajectory (Δ/steps/best-worst), savings-rate (paired income-vs-expenses months, thresholds ≥20% green), interest-vs-allowance (PSA headroom math), credit-strategy (all cards: modes, stooze deadlines, on-track/behind, flex cost), spending-profile (category concentration), debt-horizon (minimums months, projection). ev: commit `4886287`
  - [x] U2 routes: `/overview/reports` index (article list w/ blurbs + dates) + `/overview/reports/[slug]` (404 on unknown, registry lookup). ev: live — index 6 [Read Report] links; bad slug 404
  - [x] U3 ReportPaper template — title block w/ date, ABSTRACT (auto numbers), METHOD bullets, findings tables (label/value + semantic flags), figures by key (netWorth/stackedArea/psaBullet/monthlySpend/categoryBars/debtWaterfall), [All Reports] + [Print / PDF], footer slug+date. ev: DOM sections ABSTRACT/METHOD/4 card sections; tableRows 12; console clean
  - [x] U4 tests: registry integrity (unique slugs, builders degrade on nonexistent user), index SSR (article list), paper SSR (structure + figures); old overview test rewritten to new architecture (anti-rot decision). ev: reports-v2.test 3/3 + stacked-area-reports-ssr 7/7; full suite 1043/1043
  - [x] U5 gate: check 0/0; all 6 reports live 200 w/ ABSTRACT+METHOD; console 0 errors; 0 5xx; vision (vmodel flaky ×3, 2 partial runs): no P0/P1 rendering defects — only a density opinion (data IS dense: 4 cards) → triaged to R29 full-width findings layout when B07 revisited; screenshot v3-b07-credit-report-1600.png
- R10 [x] ticked. ASCII/range chart cluster from the old page retired with the page (charts live on inside report figures; ASCII mode remains on… DECISION: ASCII variant was page-local; if missed it can return as a report-level toggle — recorded as R-H2 harvest candidate).

### B08 TOOLS (Sweep 4 — COMPLETE)
- research: old /tools = ONE page, 4 tools crammed 2×2 (rate what-if, overpayment, ISA optimiser, compound projector) with `max-w-6xl`; tool-math.ts is the shared client math w/ parity tests; getToolsData the shared loader.
- judgments: index-and-sub-pages (like reports) — `/tools` becomes a card grid; each tool gets `/tools/[slug]` full-width with MORE detail than the old cards: rate tool gains per-account scenario table; overpayment gains ALL-debts comparison; ISA optimiser gains move-sources breakdown (highest rate first); compound gains yearly milestones table. TWO NEW tools (R13 "more more more"): stooze calculator (seeded from real cards) + milestone projector (net-worth slope). New math in tool-math.ts (daily-compounded stooze earnings, mean-delta milestone projection).
- units (all [x]):
  - [x] U1 tool-registry.ts (6 slugs/names/blurbs) + tool-math: stoozeCalculation + projectMilestones. ev: hand-computed tests — £1000@5%/365d = 5127p±, revert 26990p±, clearBy=−5d; £2000→£3200 over 12mo → £10k crossing at 68 months; flat/falling → [] (4 new tests, 29/29 file)
  - [x] U2 6 tool components under components/tools/ (4 moved+deepened, 2 new). ev: tools-page-ssr.test 8/8 (index cards, sub-page shell, component details, empty states)
  - [x] U3 routes: `/tools` index grid + `/tools/[slug]` (registry lookup, 404 unknown, per-tool data assembly: cards for stooze, netWorthHistory for projector). ev: live — index 6 cards; all 6 sub-pages 200 w/ [All Tools]; bad slug 404
  - [x] U4 live deep-check: stooze seeded £2,585 from real Visa Gold (no promo → honest zeros), fi-projector window 2025-11→2026-02 delta −£352/mo → "flat or falling; no milestone" (correct negative path). Console clean, no errors. ev: CDP outputs above
  - [x] U5 gate: check 0/0; full suite 1047/1047; commit `04a7e65`
- R13 [x] ticked. Old single-page tools tests rewritten to new architecture (anti-rot).

### B09 BUDGET (Sweep 5 — COMPLETE)
- research: /overview/budgets/[month] = 740-line monolith; status numbers scattered across 5 vertical bands (target accordion subtitle, progress bar, pace section, burn-down, filters); everything 1-column; no SSR test pins.
- judgments (R9+R29): 4-cell SUMMARY STRIP under the header (Status/Spent-target/Pace/Remaining-or-Over incl. per-day-for-remaining-days math); two-column body (grid-cols-3: left col-span-2 = progress + category targets; right = target accordion + pace + burn-down + filters + amendments + history) — config out of the way, the month at a glance; logic/forms untouched (template-only restructure).
- units (all [x]):
  - [x] U1 summary strip (semantic colours; pace label "over pace"/"on pace"; over-budget shows per-day remaining or projected). ev: live summaryCells 6, DOM-verified
  - [x] U2 two-column restructure via python slicing (gotcha: div-close accounting — page outer div + history inner both needed explicit closes; 3 iterations to balance). ev: check 0/0; live gridCols 3, col-span-2 present
  - [x] U3 vision findings fixed: amendment options bar now says it attaches to the next config edit; note input widened; pace wording unambiguous; R16-class literal-bracket bugs (`[[All Months]]` etc.) stripped from budget surface. ev: commit `e09a288`
  - [x] U4 R-H4 HARVEST: the bracket bug was app-wide — 58 instances across 29 files batch-fixed (incl. 7 I introduced tonight in tools/wizards); regression net tests/integration/bracket-link-convention.test.ts (owning-tag-aware heuristic, no false positives); 5 stale test pins updated to CSS-bracket convention. ev: grep count 0; suite 1051/1051
  - [x] U5 new SSR test budget-page-redesign-ssr.test.ts (summary cells, grid, over-label semantics). ev: 3/3
- R9 [x]; R17(budget leg) [x]. Vision log updated (no P0; P1 amendment-cluster = pre-existing options-bar UX, clarified; P2s fixed or triaged to R29 polish).

### B10 TAX (Sweep 5 — COMPLETE)
- research: /overview/tax wall-of-text = BAND FINDER's Arithmetic column — stacked prose lines (KNOWN/BOUNDED/PROJECTED/INTEREST/ASSESSMENT) inside a wide table; no SSR test pins; engine (band-finder, interestBreakdown projection) already tested.
- judgments (R11+R29): finder years become CARDS (grid 2-up wide) — verdict badge + suggested band in header; THRESHOLD BAR visualising assessment vs £50,270/£150,000 with a LABELLED higher-rate marker (not mystery ticks); arithmetic as label→value MINI-TABLE (scannable, semantic margin row); per-card controls (assumption form, apply-as). Band history untouched.
- units:
  - [x] U1 page rewritten (finder section only). ev: commit `32df8b4`; live 3 finder cards, cardGrid true, 3 threshold bars, 14 mini-table rows; console clean
  - [x] U2 vision (zai-vision; vmodel 1305): 0 P0. P1 "interest misprojected 7.5×" REJECTED with source evidence — projection is rate-forward by design (getProjectedInterestBreakdown: current balances × current rates × days-remaining; label says +proj; same figure appears in B07's interest report from the same tested engine; prior-year ACTUAL ≠ this-year rate-forward projection). P2s: 3-cards-in-2-col dead space + apply-control position inconsistency → R29 polish list; bar label collision risk → fine at current widths. ev: this entry + v3-b10-tax-1600.png
  - [x] U3 gate: check 0/0; full suite 1051/1051 (146 files). ev: outputs above
- R11 [x]; R17(tax leg) [x].

### B11 ALERTS (Sweep 5 — COMPLETE)
- research: /alerts already groups by title + severity with expand/ack/snooze (v2); the digestibility gap = one long vertical wall + no at-a-glance counts; AlertBadge carries 2 missed literal-bracket labels (multi-line tags).
- judgments (R12+R29): severity SUMMARY STRIP (counts) + severity LANES (red|amber|info side by side at lg) replacing the stacked sections; empty lanes hidden on small, shown as "none" in lane at wide; accounts-affected count in the header.
- units (all [x]):
  - [x] U1 lanes + strip + header count. ev: commit `5cd73f1`; live stripCols 3 / laneCols 3 aligned, lane headers CRITICAL 9 | WARNINGS 13 | INFORMATION 6 (sums to 28 = header total — vision reconciled)
  - [x] U2 vision P1s fixed: strip↔lanes misalignment (strip 4→3 cells, accounts-affected → header); AlertBadge literal `[View]`/`[secondary]` brackets stripped + title span min-w-0 truncate for narrow lanes. ev: commit `eac0fab`; live doubleBrackets 0, overflowClusters 0
  - [x] U3 gate: check 0/0; alert tests 9/9; suite 1051/1051. ev: outputs above
- R12 [x].

### B12 SNAPSHOTS (Sweep 5 — COMPLETE)
- research: list w/ trend arrows + staleness + pagination already solid (v2); no at-a-glance summary; create action buried in section header.
- judgment: summary strip (Latest net worth + date · Latest change vs previous · Freshness w/ staleness dot + page n/N · Action cell w/ create link) — consistent with B09/B11 strip pattern.
- [x] U1 strip added. ev: commit `ca24496`; live cells 4, "Latest net worth" present; check 0/0; suite 1051/1051. R17(snapshots leg) [x].

### B13 ROUTINE (Sweep 5 — COMPLETE)
- research: streak + checklist + history table; checklist was a flex-wrap text blob; no summary.
- judgment: summary strip (Current streak · Longest · This month x/y or "not started" · Action = start/continue link); checklist becomes a bordered cell grid (md 2-col, lg 3-col).
- [x] U1 strip + grid. ev: commit `ca24496`; live cells 4, checklist 6 cells in grid; R17(routine leg) [x].

### B14 BILLS & PAYSLIPS (Sweep 6 — COMPLETE)
- research: NO bills/payslip tables exist; bills are IMPLICIT (recurring-pattern detector → projectObligations → cashflow calendar); income = declared month-keyed history; R25 asks for the direct-debit-vs-billed judgment, R24 for import-vs-derived-report.
- JUDGMENT R25: bills stay DERIVED from payment evidence (detector: ≥3 occurrences, 28–35d cadence, ±10% amounts) — the DD-vs-invoiced distinction is invisible in transaction data and irrelevant to "what regular money goes out + when's next"; a hand-maintained bills table would add data entry + drift for zero insight. Implemented as `/overview/bills` (summary strip: count/per-month/per-year/next-due + table w/ 12-mo cost + last/next dates + totals row), nav link added.
- JUDGMENT R24: derived report FIRST (the pre-seeded recommendation) — no payslip import; the payslip review = declared income vs actual deposit evidence from the ledger. Implemented as reports registry entry `income-vs-deposits` (per-month declared vs deposited + gap flags >£100 + reading-the-gaps notes; deposits grouped by strftime month).
- units (all [x]):
  - [x] U1 /overview/bills page + nav. ev: commit `25e72c7`; live 200, strip 4 cells, honest empty state (dev data has no qualifying patterns — detector verified by its own tests); report live 200 w/ ABSTRACT, 12 month rows
  - [x] U2 income-vs-deposits report + registry test coverage. ev: same commit; reports-v2.test 3/3 incl. new slug
  - [x] U3 gate: check 0/0; suite 1051/1051 (1 unrelated unlock-ceremony flake, green isolated + full rerun — documented flake pattern). ev: outputs above

### B15 DX & AGENT TOOLING (Sweep 6 — COMPLETE)
- R27: anonymise CLI verified END-TO-END on a dev DB copy (username admin→elmsworth.quarry79; 16 accounts/112 tx/4 snapshots preserved; amounts jittered; dates month-shifted; self-check PASS; ciphertext descriptions pass through verbatim by design — AAD-bound). import_jobs TABLE_RULES entry added in S4. Tool was already complete; v3 contribution = verification + runbook currency. ev: command output above (2026-10-29, supersedes 2026-10-18 check)
- R28: agent runbook §9 "v3 extension surfaces" — reports registry, tools registry, data pipeline map, sanctioned schema path (5 steps incl. journal hash + TABLE_RULES), loop gotchas (CURRENT_TIMESTAMP/Invalid Date, filePath, bracket convention). ev: commit `3310fec`

### B16 CROSS-CUTTING / SWEEP 7 HARVEST (2026-10-29 23:17 → 23:21)
- R-H3 IMPLEMENTED: report papers full-width (max-w cap dropped, R1-consistent) + findings 2-col grid (md:grid-cols-2, figure sections col-span-2). ev: commit `de46c48`; live findingsGrid true, figureSpans 2; tests 7/7
- R-H2 IMPLEMENTED: ASCII render toggle on report papers (localStorage `charts-ascii`, [ASCII] button beside [Print / PDF]) — netWorth + stackedArea figures swap SVG↔ascii pre blocks. ev: live off=2 svg/0 pre → on=0 svg/3 pre
- R-H5 IMPLEMENTED: tax finder cards 3-up at xl (dead quadrant fixed). ev: commit `1fe28c8`
- R-H8 IMPLEMENTED: amber text contrast pass — text-amber-600→700 app-wide (10 files; 4.19:1→5.13:1, WCAG AA). ev: same commit; check 0/0; suite 1051/1051
- Home-vs-alerts badge count (B02-noted mismatch) re-verified: home "ALERTS (28) [!!9] [!13]" == /alerts page 28 with matching lanes — NO BUG (stale-session artifact from B02). Recorded as resolved-by-verification.

### SWEEP 7 CONTINUED — vision re-audit round (2026-10-29 23:22 → 23:27)
- Vision re-review of the R-H3 report grid (v3-b07h-report-grid-1600.png, zai-vision) found 3 REAL defects, all fixed same unit (commit `8926b9a`):
  - P0 lone table in 2-col grid left an empty quadrant → tables now span full width UNLESS ≥2 tables exist (pairing only when it pays). ev: live spanningSections 3, no empty cell
  - P1 "largest rise −£352.03" on a monotonic-decline window → builder now emits rise/fall rows only when a step of that sign exists; abstract picks the biggest step with its true kind ("a fall of £352.05"). ev: live labels show ONLY "largest fall"; abstract snippet verified
  - P2 ascii charts stretched full-width read as compressed clusters → pre capped max-w-3xl
- Gate after fixes: check 0/0; suite 1052/1052; build green. ev: outputs above

## Sweep 1 — GATE PASSED (2026-10-29 20:20 GMT)
- check 0/0 ✓ · full suite 988/988 ✓ · build green (adapter-node ✔) ✓
- live smoke: `/`, `/goals`, `/goals/debt/clear-mastercard`, `/accounts` — console 0 errors, network 0 5xx on all
- vision spot-checks: home ×3 (bento v1 → fixes → R29 two-column), goals ×1, accounts ×1 — zero open P0/P1 on changed surfaces; P2s triaged (chart internals → R31; polish → later sweeps)
- ledger current · all work committed through `5f10731`

## Decisions
| Date | Decision | Rationale |
|---|---|---|
| 2026-10-29 | v3 reverses v2's mobile flex-wrap responsive work: full desktop viewport, NO wrapping, mobile = zoomed-out desktop (scaled viewport meta) | Direct user instruction R1 ("don't consider mobile… no wrapping") supersedes v2's 390px sweep |
| 2026-10-29 | "Before / revert" semantics: the pre-v2 state is the `main` branch (v2 branched from main); resolve reverts via `git show main:<path>` | Only stable definition of "before" |
| 2026-10-29 | Reverted-in-v3 v2 features stay revertible: keep v2's regression nets where they still apply; update tests that pinned now-reverted behaviour in the same unit | Anti-rot: tests must match the shipped product |
| 2026-10-29 | Reports v2 keeps the terminal aesthetic inside a science-paper structure (title/abstract/method/findings), not a literal LaTeX pastiche | Aesthetic rules are ground rules; format borrows structure only |
| 2026-10-29 | Credit modes are per-account (a card is in stooze mode OR panic mode), switchable, with mode recorded so reports respect it | Matches the two real user intents; keeps one source of truth |
| 2026-10-29 | Loop runs in a dedicated worktree sandbox (`offline-finance-dashboard-v3`) with copied `.env` + DBs; main checkout read-only; agent-side guard config enforces external-directory denial + catastrophic-command deny-list | User decision (containment focus: damage outside the project folder + other repos) |
| 2026-10-29 | No DB backup snapshots during the run — the original `dev-plain.db` in the main checkout is the recovery point; a wrecked sandbox DB is re-copied | User decision; coherent because the worktree copy is expendable |
| 2026-10-29 | No push guard of any kind — pushes remain possible (plan still says the LOOP never pushes, but nothing technical blocks it and the user's manual pushes stay untouched) | User decision ("allow push") |
| 2026-10-29 | Fixed import casing debt: `index.ts` + `+layout.svelte` imported `Navigation.svelte` but git records `navigation.svelte`; imports corrected to git casing (not a rename) | Fresh worktree checkout materialized true git casing, exposing latent wrong-case imports that the main checkout's case-insensitive FS had masked; git casing is canonical |
| 2026-10-29 | USER mid-run direction appended to plan as §9 R29–R31: full-width multi-column bento layouts app-wide; home gallery loses its title + shrinks into a bento grid; all charts audited against best svelte viz packages | User instruction during Sweep 1 B02 ("original design was a narrow vertical box… take advantage of 1440px… gallery too large and tall, looks terrible… best svelte data visualisation npm packages"). R31 respects the package.json lock: layerchart (already installed) is the preferred library; anything else needs explicit approval |
| 2026-10-29 | NEVER-STOP override: plan §0 amended + `--batch 5` removed from Appendix A — the agent works continuously within each turn, ending only at §8 stop conditions or genuine BLOCKED; mid-run user messages are requirements to integrate, never reasons to pause | User instruction ("why did you stop the loop. you must never stop… prevent yourself from stopping. even when i add my own thoughts and comments"); batch-capped turn endings halted the loop between harness re-invocations |

## Deferrals
| Item | Reason |
|---|---|

## Vision review log
| Date | Screenshot | Verdict |
|---|---|---|
| 2026-10-29 | v3-b06-data-1600.png (zai-vision; free endpoint 1305 ×4) | Data management page: no P0; no ciphertext/[object Object]/`<br>` bugs; terminal aesthetic consistent. P1×2 REJECTED as below-fold artifacts (filters + wizard steps DOM-verified present; vision itself flagged the caveat). P2 `[*K]` = documented ⌘K misread; P2 Session&Security nav overlap → noted for B01 later sweep |
| 2026-10-29 | v3-b07h-report-grid-1600.png (zai-vision) | Report findings grid v1: P0 empty quadrant (REAL — lone table, fixed w/ conditional spans), P0 ascii unreadable (partially REAL — opt-in mode stretched, capped max-w-3xl), P1 negative "largest rise" (REAL — monotomic window labeling bug, fixed). All 3 verified fixed live | 
| 2026-10-29 | v3-b09-budget-1600.png (zai-vision) | Budget redesign: no P0. P1 amendment-cluster = pre-existing options-bar UX (no apply button BY DESIGN — options ride on next config edit) → clarified with helper text; P2s: note placeholder truncation FIXED (w-64), column height imbalance (accepted, content-driven), bracket dialect = REAL R16-class bug → fixed app-wide as R-H4, amber pace contrast → wording fixed ("over pace") |
| 2026-10-29 | v3-b05-credit-1600.png | Credit strategy panel + splits tracker: clean terminal rendering, no misalignment/unreadable/bugs — P0 none |
| 2026-10-29 | .docs/reviews/2026-10-29-1916-ultimate-v3-audit/v3-b01-home-1600.png | No P0/P1; "spans the full viewport width (no narrow centered column)". Claim of `[[⌘K]]` double-bracket REJECTED — DOM: text `⌘K` + one pseudo `[`/`]` (known vision glyph misread) |
| 2026-10-29 | .docs/reviews/2026-10-29-1916-ultimate-v3-audit/v3-b02-bento-1600.png | (zai-vision; vmodel 1305 ×2) P1: dead gap between cells (REAL — my max-w cap), [[SVG]]/[[PNG]] double brackets (REAL — ChartPanel literal brackets), caption delta wrong (REJECTED — vision misread padded y-max label as data point). P2s: ragged bottoms (REAL), chart too tall (REAL), tick spacing/markers (→ R31) |
| 2026-10-29 | .docs/reviews/2026-10-29-1916-ultimate-v3-audit/v3-b02-bento-fixed-1600.png | (zai-vision; vmodel 1305 ×3 exhausted) 3/4 prior defects verified fixed; ragged-bottom claim re-checked via DOM: panels aligned 269/269 after h-full fix; P2-3 "goals" noun copy bug REAL → fixed same unit |

### Sweep 8 (2026-10-30 morning session)
- .gitignore storage/backups committed (overnight session's uncommitted tail). ev: check 0/0 + 1052/1052 re-verified on resume
- R31 COMPLETE (audit disposition): layerchart stays the interactive layer; 12 terminal charts stay hand-rolled BY DESIGN (print-safe SSR + deterministic + test-pinned); deferred NetWorthChart P2s fixed (all-point ticks ≤6, marker legend, wide padding). ev: commit `720f033`; 17 chart tests green
- docs/dev/ultimate-3.0-release.md written (changelog + runbook, v2 format, factual from block records). ev: commit `ee5b742`
- R29 account detail: strategy+splits paired 2/3 (panic cards), balances+notes paired 3/2; transactions/interest rates stay full-width. ev: commit `c3c8ad7`; live grids [622,936]+[936,622], console 0 err / 0 5xx
- Vision re-audit of account detail: strategy/splits row clean (equal heights, no doubling); balances/notes below-fold in shot (DOM-verified 936/622); amber contrast claim REJECTED (measured 5.13:1 AA in R-H8); `[[Add Rate]]`/`[[Delete]]` double brackets CONFIRMED REAL via DOM (R-H4 sweep misses) → fixed app-wide on account components (InterestRates/Notes/Transactions/ConfirmModal) + ConfirmModal labels restored correctly after over-reach (empty-button a11y warnings caught by check and fixed same unit). ev: commits `53f0b3d`+`c614ae8`; live doubleBracketButtons:[] 
- Gotcha: after dev-server restart the keyring seals — expect /unlock ceremony before CDP verification (password unlock flow verified working).

- R29 year pages: interest 2026-27 projection+integrity paired 3/2; ISA pacing+integrity paired 3/2 (integrity renders exactly once). ev: commit `35a7ed6`; live grids [936,622] both, console 0 err / 0 5xx
- R29 goals detail JUDGMENT: no grid — allocation (savings) and linked-debt (debt) sections are mutually exclusive by goalType (never co-render), and the page is card+accordion shaped; forcing pairing adds nothing. R29 now dispositioned across ALL major surfaces: home, accounts list+detail, goals list, interest+ISA years, budgets, tax, reports, tools.

## Notes for next iteration
- **STATE: R1–R28 ALL [x] · 5/5 R-H implemented · 8 sweeps (0–7) done · check 0/0 · 1052/1052 · build green.** Remaining for Definition-of-v3: (a) ledger ≥12h genuine work — currently ~3h (CORRECT, date-anchored rows only) — the gate CANNOT be met yet, so NO stop file; (b) final full-app audit finding zero open P0/P1 (tonight's surfaces are clean; re-audit everything fresh next blocks); (c) docs/dev/ultimate-3.0-release.md changelog+runbook (final-gate item).
- **NEXT BLOCK: continue sweep 7+ harvest/polish.** Candidates: R-H1 statement-backfill queue preset (speculative — only if it earns its keep); home row-1 dead-space centering (B02 P2); budget column height imbalance; R31 layerchart audit (still unvisited — chart components hand-rolled; layerchart is in the stack); R29 pass over remaining surfaces (accounts detail, goals detail, interest years, isa pages); B04 deeper closed/open presentation.
- Dev server RUNNING (5173, worktree). CDP page 1 authed. Dev DB: Mastercard in panic mode w/ promo 2027-03-15 (live-test residue, sandbox-expendable).
- CDP gotchas: take_screenshot needs `filePath`; form-submit scripts destroy evaluate context; resize 1600×1000 before screenshots.
- Progress-file gotcha: NEVER anchor edits on the `## Sweep 1 — GATE` heading (consumed 3× — all repaired); python heredoc beats edit-tool for tab-heavy blocks.
- vmodel.sh 1305-flaky tonight; zai-vision MCP worked every time (first-try) — prefer it for gates.
- The registry extension pattern is the v3 way: reports (server/reports-v2.ts), tools (utils/tool-registry.ts) — one builder + one entry.
