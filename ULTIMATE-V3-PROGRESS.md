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
| R7 | [ ] | credit modes: panic vs stooze |
| R8 | [ ] | Monzo-method transactions (pay-off-now vs over-time cost) |
| R9 | [ ] | budget UX redesign |
| R10 | [ ] | reports v2 — dated science-paper-style focused reports |
| R11 | [ ] | tax page — kill wall of text |
| R12 | [ ] | alerts digestibility |
| R13 | [ ] | tools expansion — sub-pages + more tools |
| R14 | [ ] | data management overhaul (core architecture redesign) |
| R15 | [ ] | transaction editability judgment (research Matrixify DROP/CREATE) |
| R16 | [x] | ev: DOM proof single-bracket `[⌘K]`/`[?]` (text + pseudo-elements); top bar de-crowded (right-clustered controls, gap-4); a11y names `[⌘K]` `[?]`; palette open/close live-verified |
| R17 | [ ] | weak areas dedicated work: tax, snapshots, accounts/liabilities, routine, budget |
| R18 | [ ] | CSV export: custom selection, readable, per-account context |
| R19 | [ ] | Matrixify/Altera round-trip: DROP + CREATE on the fly |
| R20 | [ ] | 0% split tracker (3-month target, statement-delay lag) |
| R21 | [ ] | remove "accounts" CSV import |
| R22 | [ ] | background import queues; survey queue candidates |
| R23 | [ ] | expenses+income history CSV export AND import |
| R24 | [ ] | payslip processing judgment (derived report first?) |
| R25 | [ ] | bills + bill history — direct-debit vs billed judgment |
| R26 | [ ] | bulk history import (Monzo back-X) |
| R27 | [ ] | scramble/anonymise real tool |
| R28 | [ ] | agent-workable repo (dev docs, tooling) |
| R29 | [x] (home) | ev: commit a9a0d92; home converted to 3/2 two-column rows, DOM-verified 936/622px, vision "conversion succeeds". App-wide R29 continues per-block (B03/B04 next) |
| R30 | [x] | ev: commits 307e48d+9f458e0+e0a77b8; untitled bento grid live (trend col-span-2 1041px / allocation col-span-1 517px, panels aligned 269/269), wide-aspect 900×180 chart, [+] expand cycle verified, vision re-review clean of prior P1s |
| R31 | [ ] | ADDENDUM §9: all visualisations on best svelte viz packages (layerchart first; new deps need approval) |
| R-H* | — | harvested items appended as discovered (≥5 to implement before stop) |

## Block registry
| Block | Last sweep | BLOCK CYCLE stage | Notes |
|---|---|---|---|
| B01 SHELL & VIEWPORT | 1 | COMPLETE (sweep 1) | R1 R2 R16 ticked; shell full-viewport; residual: page-level max-w wrappers → B02/B03/B04 |
| B02 HOME | 1 | COMPLETE (sweep 1) | R3 ✓ R29(home) ✓ R30 ✓; chart-internal P2s → R31 |
| B03 GOALS | 1 | COMPLETE (sweep 1) | R4 ✓ R6 ✓; bulletbar keeps tick capability (unused); deeper R29 grid pass when B03 revisited |
| B04 ACCOUNTS & LIABILITIES | 1 | FIRST PASS (sweep 1) | R5 ✓ R29(accounts) ✓; R17 deeper work → sweep 5 |
| B05 CREDIT & STOOZING | — | unvisited | R7 R8 R20 · sweep 2 |
| B06 DATA MANAGEMENT | — | unvisited | R14 R15 R18 R19 R21 R22 R23 R26 · sweep 3 |
| B07 REPORTS v2 | — | unvisited | R10 · sweep 4 |
| B08 TOOLS | — | unvisited | R13 · sweep 4 |
| B09 BUDGET | — | unvisited | R9 R17 · sweep 5 |
| B10 TAX | — | unvisited | R11 R17 · sweep 5 |
| B11 ALERTS | — | unvisited | R12 · sweep 5 |
| B12 SNAPSHOTS | — | unvisited | R17 · sweep 5 |
| B13 ROUTINE | — | unvisited | R17 · sweep 5 |
| B14 BILLS & PAYSLIPS | — | unvisited | R24 R25 · sweep 6 |
| B15 DX & AGENT TOOLING | — | unvisited | R27 R28 · sweep 6 |
| B16 CROSS-CUTTING | — | unvisited | harvested · every sweep gate |

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

## Sweep 1 — GATE PASSED (2026-10-29 20:20 GMT)
- check 0/0 ✓ · full suite 988/988 ✓ · build green (adapter-node ✔) ✓
- live smoke: `/`, `/goals`, `/goals/debt/clear-mastercard`, `/accounts` — console 0 errors, network 0 5xx on all
- vision spot-checks: home ×3 (bento v1 → fixes → R29 two-column), goals ×1, accounts ×1 — zero open P0/P1 on changed surfaces; P2s triaged (chart internals → R31; polish → later sweeps)
- ledger current · all work committed through `5f10731`
- research:
  1. Milestone tick LINES are v2's "Phase 4 V1 #3" system: util `goal-milestone-ticks` + rendering in DebtCard (ticks each-block in bar), GoalCard (emergencyFundTicksForBar), GoalRow (ticks derived + GoalBulletBar), GoalDetailCard. GoalBulletBar is a v2-only component (not on main), used by GoalRow.
  2. Pre-v2 (main): bars have NO tick lines; GoalCard/GoalRow DID have textual milestone labels (1mo/3mo/6mo/12mo under the name) — those are NOT the complaint and stay.
  3. R6 width offenders: `goals/+page.svelte:271` `max-w-3xl mt-3` (allocation section), `goals/debt/[slug]/+page.svelte:23` `max-w-4xl` page wrapper.
  4. Home also passes `milestones` to DebtCard (+page.svelte) — prop removal must update call sites.
- judgments:
  1. Remove tick-LINE rendering from all 5 components (bars revert to pre-v2 form); KEEP textual milestone labels that predate v2; KEEP the milestone data model + create/edit UI (removing the schema is out of scope for R4 and the data feeds textual "next milestone" hints).
  2. DebtCard: drop ticks block + derived + prop; home call site drops the milestone prop. GoalCard: drop emergencyFundTicksForBar block + import; keep textual row. GoalRow: drop ticks derived + GoalBulletBar usage → inline plain bar (GoalBulletBar with default no-ticks already renders plain bar — simpler: stop passing ticks, keep component; component keeps defaulting ticks=[] so it renders a plain bar). GoalDetailCard: drop its tick block.
  3. R6: allocation section + debt detail lose max-w wrappers (full width per R1/R29).
  4. Update tests pinning ticks (search tests for milestone-ticks/debtTicks).
- PLAN:
  - [x] U1 strip tick lines from DebtCard (+ home call site milestone prop) + GoalDetailCard checked (textual only — kept). ev: commit `ebef83b`; DOM tickLines:0 on /goals
  - [x] U2 strip tick lines from GoalCard + GoalRow (textual 1mo/3mo labels KEPT — pre-v2 feature); GoalBulletBar keeps tick capability (unused default plain). ev: same commit; vision "plain progress bars with no vertical tick marks"
  - [x] U3 R6 width: goals allocation `max-w-3xl` removed (panel 1582px live), debt detail `max-w-4xl` → `w-full` (1582px live). ev: DOM wrapClass "p-4 w-full", allocPanelWidth 1582
  - [x] U4 gate: check 0/0; full suite 988/988 (bulletbar tick-capability tests still green — component unchanged); live /goals (10 rows, 10 plain bars, console 0 err, 0 5xx) + /goals/debt/clear-mastercard (0 ticks, full width, clean). Gotcha found: /goals/debt/pay renders "Debt goal not found" error page — legacy breadcrumb artifact, not a real slug; error page itself renders correctly. ev: CDP outputs above
  - [x] U5 record + tick R4/R6 — below

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
| 2026-10-29 | .docs/reviews/2026-10-29-1916-ultimate-v3-audit/v3-b01-home-1600.png | No P0/P1; "spans the full viewport width (no narrow centered column)". Claim of `[[⌘K]]` double-bracket REJECTED — DOM: text `⌘K` + one pseudo `[`/`]` (known vision glyph misread) |
| 2026-10-29 | .docs/reviews/2026-10-29-1916-ultimate-v3-audit/v3-b02-bento-1600.png | (zai-vision; vmodel 1305 ×2) P1: dead gap between cells (REAL — my max-w cap), [[SVG]]/[[PNG]] double brackets (REAL — ChartPanel literal brackets), caption delta wrong (REJECTED — vision misread padded y-max label as data point). P2s: ragged bottoms (REAL), chart too tall (REAL), tick spacing/markers (→ R31) |
| 2026-10-29 | .docs/reviews/2026-10-29-1916-ultimate-v3-audit/v3-b02-bento-fixed-1600.png | (zai-vision; vmodel 1305 ×3 exhausted) 3/4 prior defects verified fixed; ragged-bottom claim re-checked via DOM: panels aligned 269/269 after h-full fix; P2-3 "goals" noun copy bug REAL → fixed same unit |

## Notes for next iteration
- **B02 IN FLIGHT — R30 bento redesign is the immediate next unit** (§9 addendum): kill the VISUALISATIONS SectionHeader (no title at all), shrink chart scale (NetWorthChart H=220 too tall? smaller viewBox + smaller text), bento grid with different-sized cells (e.g. trend chart wide 2-col span, allocation narrow, cashflow cell) — `grid grid-cols-<n>` with col/row spans, terminal borders. Then vision-review the redesigned gallery (deferred from U5). Then R29 pass over the rest of home (KPI rows → grids), then B03 GOALS (R4 R6 + milestones prop removal lives there: `milestones={(goal as any).milestones ?? null}` in +page.svelte:350), then B04 ACCOUNTS (R5 heatmap width).
- Sweep 1 gate when B02–B04 done: check 0/0 + full tests + live smoke of changed routes + vision spot-checks + `npm run build` + ledger + commits.
- Audit dir for sweep-1 screenshots: `.docs/reviews/2026-10-29-1916-ultimate-v3-audit/`.
- Dev server RUNNING (5173). CDP page 1 authed; **resize_page to 1600×1000 BEFORE screenshots** (window was emulating 500×844 phone). Sessions die <60s — re-login per Appendix B.
- Gotchas hit: (a) print CSS `body > div` selector wrong — SvelteKit wraps body in `display:contents` div; used `.app-shell` class instead. (b) Palette-open check must run in a SEPARATE evaluate_script after click (Svelte flush is async). (c) Escape keydown must dispatch on `window` not `document`. (d) Test suite: 1 uncaptured first-run failure then 2× full green — documented flake; if a named failure recurs, investigate properly.
- vmodel.sh: 1× 1305 flake then success on retry 2 (within the ×2 budget).
- 30 flex-wrap instances remain app-wide (legends/forms mostly) — audit per-block in later sweeps per B01 judgment #4.
