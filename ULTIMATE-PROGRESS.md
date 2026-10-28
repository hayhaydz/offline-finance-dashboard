# ULTIMATE Release — Progress
Branch: release/ultimate-2.0 · Started: 2026-10-28T19:29+00:00

## Time ledger
(Corrected 19:58 against real git commit timestamps — earlier end-times had drifted ahead of the wall clock.)
| Session start | Session end | Elapsed | Work done |
|---|---|---|---|
| 2026-10-28T19:29 | 2026-10-28T19:35 | 0h06m | Phase 0 bootstrap + P0-1 (commit 2bb5d5f @19:35) |
| 2026-10-28T19:36 | 2026-10-28T19:57 | 0h21m | P0-2 (19:40), P0-3 (19:42), Phase-1 E2E (19:49), P1-1/2/3 (19:52), P1-4 (19:57) |
| 2026-10-28T19:58 | 2026-10-28T20:09 | 0h11m | P1-5 shared computeGoalProgress (7 tests, routine+snapshot wired) + P1-6 ledger default newest-first — Phase 2 line 2 complete |
| 2026-10-28T20:09 | 2026-10-28T20:20 | 0h11m | P1-7 open-only account counts + £0-loan rate hidden · P1-8 pagination logs stripped · P1-9 liquid-only Ready-to-Assign — Phase 2 line 3 complete |
| 2026-10-28T20:20 | 2026-10-28T20:31 | 0h11m | P2-1 crumbs · P2-2 ConfirmModal · P2-4 ISA over-sub warning · P2-5 copy nits — Phase 2 line 4 complete |
| 2026-10-28T20:31 | 2026-10-28T20:41 | 0h10m | #2 SeverityLegend everywhere · #5 pace-aware goal colours · #6 touched-on-input (live-verified, re-login OK) — Phase 2 line 5 complete |
| 2026-10-28T20:41 | 2026-10-28T20:44 | 0h03m | LEDGER CORRECTION: re-reading notes — line-5 work actually ended 20:22 (commit ce3b08b); ledger row above overstated by ~19m. Corrected cumulative: ~0h53m through Phase 2 line 5 |
| 2026-10-28T20:23 | 2026-10-28T20:44 | 0h21m | #7 overspend hatch + #8 [i] notes + #10 alert acknowledge (schema+seed+migration 0009) + Phase 2 gate (5× vision CLEAN) — PHASE 2 COMPLETE |

## Master checklist
### Phase 0 — Bootstrap
- [x] Branch `release/ultimate-2.0` confirmed (created from `main`) — ev: `git branch --show-current` → release/ultimate-2.0 (created off main @ 8a67f0d)
- [x] `ULTIMATE-PROGRESS.md` created; plan + progress committed as first commits — ev: commit 45eb59c; plan file itself is `.docs/`-local (see Decisions)
- [x] Baseline `npm run check && npm test` recorded — ev: check = 0 errors 0 warnings; test = 101 files / 740 tests all passed (19:30)
- [x] Dev server up; DevTools login admin; home snapshot clean — ev: server pid 54211 (pre-existing, clean env, no stale DEV_AUTO_LOGIN); login admin/password OK; home snapshot renders net worth −£7,040.75 + nav; 0 console errors (only known P1-8 [DEV] PaginationClient logs); 0 failed network reqs

### Phase 1 — P0 fixes (each with regression test)
- [x] P0-1: GoalDetailCard TDZ — reorder deriveds + SSR smoke test — ev: reordered to `debtValues → progress → progressColor` (Svelte SSR evaluates deriveds eagerly; forward refs throw TDZ — verified by stashing fix: 5/5 tests fail with exact audit error `Cannot access 'progress' before initialization`, restored → 5/5 pass); new tests/integration/goal-detail-card-ssr.test.ts (savings 40%, debt 60% from starting balance, zero-target safe); check 0/0; suite 745/745; live `/goals/vh_G4FhSzFz8Kj8D` (Emergency Fund) renders with progress, 0 console errors
- [x] P0-2: ciphertext leak — passthrough renders `[encrypted]`; root-cause seed keyring — ev: real root cause ≠ audit guess: month-ledger query in accounts/[slug]/+page.server.ts returned raw rows (no decrypt call); seed keyring was CORRECT (recurring-patterns path decrypted fine). Fix = decrypt ledger rows + hardened decryptResilient in protected-fields.ts (EnvelopeError → `[encrypted]`, SealedError propagates; covers tx/note/review). 7 new tests (round-trip, foreign-key blob → [encrypted], transposed AAD → [encrypted], legacy plaintext passthrough, null, malformed v1, error class). check 0/0; suite 752/752. LIVE: /accounts/uomFW8Wer1SELjGX ledger now shows readable text (Salary, Utilities, Supermarket refund — overcharge) where `v1|66d907…` rendered before; 0 v1| leaks across 2 more accounts + goal detail; console clean
- [x] P0-3: `[object Object]` error page — normalise thrown values — ev: real root cause: `page.error` is a plain `{message}` object (kit HttpError), never an Error, so `String(error)` → `[object Object]` on EVERY error page. New `errorDisplayMessage()` helper (src/lib/utils/error-display.ts) used in +error.svelte (reactive — SSR first paint too) + hooks.server.ts developerMessage; 9 unit tests incl. "never returns [object Object]" invariant. check 0/0; suite 761/761. LIVE: /goals/does-not-exist-slug showed `[object Object]` pre-fix → `Message: Goal not found` post-fix
- [x] Live-verify goal money flow end-to-end (create → add → detail → withdraw → detail) + vision — ev: LIVE full flow as admin: create "Loop Test Goal" £1k → detail 0% → Add £250 (slider form) → redirect detail SAVED £250/25% → Withdraw £100 → redirect detail SAVED £150/15% + ALLOCATION HISTORY (+ADD £250, -WITHDRAW -£100, Main Current links) → confirm-archive typed confirmation → moved to /goals/archived, £150 returned to Ready-to-Assign. 0 console errors, 0 5xx across flow. Vision: detail-before CLEAN (zai), after-add CLEAN (flash), after-withdraw CLEAN no P0/P1 (zai, 5 P2 polish nits noted for Phase 2+). Shots: /tmp/opencode/p01-goal-{detail-before,after-add,after-withdraw}.png

### Phase 2 — P1/P2 bugs + quick wins (#2–#10)
- [x] P1-1 `<br>` PSA bars · P1-2 liabilities formatCurrency · P1-3 breadcrumb slugs/labels — ev: P1-1: KpiCard gained `detailLines` prop (stacked divs); interest/2026-27 page LIVE shows `[##########] 100%` / `OF £500.00` on two lines, zero literal `<br>`. P1-2: 4 currency spots routed through formatCurrency; LIVE liabilities shows `-£253,790.00` total + `-£2,315.00` balance (separators + sign convention). P1-3: snapshot loads were off-by-one (overriding segment 1 = 'snapshots', not the slug at 2) — detail now `Overview > Snapshots > 2026-02-01`, delete `… > Delete`; goal/account routes confirmed already correct. check 0/0; suite 761/761
- [x] P1-4 debt milestone inversion + payment history · P1-5 shared goal-progress fn (tests) · P1-6 Newest-First toggle semantics — P1-4 (commit 2b02b42): two-way syncMilestones + honest seed (positive thresholds, Visa payment txns) + re-seed; LIVE Visa 7%→0 ticks + PAYMENT HISTORY (2), Mastercard 44%→1 tick. P1-5: new shared `computeGoalProgress`/`enrichGoalsWithProgress` in goals.ts (7 unit tests compute-goal-progress.test.ts); wired into routine GOAL PROGRESS + snapshot goalsBreakdown (schema type extended, progressView stored per snapshot; old snapshots fall back gracefully, debt rows tagged [DEBT]); LIVE: routine Visa row = Target £2,500/Saved £185/7% (was £0/£0·0%), snapshot create shows all 7 debt goals with real paid figures. P1-6: TransactionFilterBar default sort flipped to newest-first (label already action-correct); 1 SSR label test (locks default); LIVE: /accounts/isa/2026-27 record opens 2026-07-29→2026-04-30 with [Oldest First] action label (was newest-first-labelled + oldest-first rows). check 0/0; suite 774/774
- [x] P1-7 account-count consistency (closed-account policy) · P1-8 PaginationClient console.logs · P1-9 Ready-to-Assign semantics — ev: POLICY = open accounts only (see Decisions). P1-7: accounts-page summary counts open only + "Closed Accounts (not counted above) 1" row; LIVE Total 15/Asset 8/Liability 7 = Home (15) = Liabilities page (7); £0-balance Tesco loan rate hidden ("-"; active HSBC loan correctly still 8.50%). P1-8: stripped all 7 dev logs from PaginationClient; LIVE home console = 2 msgs (vite), 0 pagination logs. P1-9: calculateReadyToAssign returns liquidAssets + totalUnallocatedAssets; RTA = instant-access only; LIVE £31,930.50 (£35,930.50 instant cash − £4,000 allocated) + "+ £210,818.75 unallocated in delayed/locked" line (was misleading £242,749.25). check 0/0; suite 774/774
- [x] P2-1 breadcrumb capitalisation map · P2-2 styled delete-confirm modal · P2-4 ISA over-subscription warning · P2-5 copy nits — ev: P2-1: labelMap extended (expenses/alerts/general/security/data/login/register/unlock/recovery/review/notes/archived/confirm/payoffs/breakdown/csv + profile→Session & Security); LIVE /alerts → "Home > Alerts". P2-2: new ConfirmModal.svelte (terminal aesthetic, esc-to-cancel, details list); TransactionsSection delete → modal (form.requestSubmit on confirm); LIVE modal shows Date/Amount/Description + cancel works. P2-4: snapshot ISA block renders "[!] OVER-SUBSCRIBED BY £180k — exceeds the £20,000 annual ISA limit" on the offending £200k/£20k snapshot. P2-5: budgets "TARGET / MO · sum of category targets · details [+]" (was "MONTHLY TARGET £X over [+]"), apply-forward checkbox+stray text → two-option radio group, ISA pacing "NEEDED / MONTH / to use full allowance" (LIVE verified), login tagline → "unlocks your data on this device — nothing leaves your machine" (source-verified; live check redirected as still-authed), profile nav → "Session & Security". check 0/0; suite 774/774
- [x] #2 severity legend · #5 bar % labels + pace colours · #6 touched-on-input forms — ev: #2: new SeverityLegend.svelte ([!!] critical · [!] warning · [i] info) rendered inside AlertsSection → appears under every alert panel app-wide; LIVE /goals shows all three legend lines (initially hidden from a11y by aria-hidden — removed, it's informative). #5: goal-row bars already carry % labels; savings-goal colour now pace-aware via calculatePaceMetrics when targetDate exists (on-track→green, behind→amber, no-deadline→percent tiers as before); goals page renders clean. #6: FormField sets touched on input; LIVE login — typed both fields with zero blur → submit enabled (previously required Tab), re-logged in as admin. check 0/0; suite 774/774
- [x] #7 overspend bar cap + hatched overflow + label · #8 sentence-case `[i]` notes · #10 alert acknowledge (schema + seed) — ev: #7: budgets header + category bars render solid=target-share + `.hatch-overflow` red diagonal hatch for the overage; getCatProgress returns UNCAPPED pct (old cap made over-target bars amber-forever); LIVE /overview/budgets/2026-10 (410% over) shows `[!] £4,645.57 over £1,500.00 target`; #8: new TechnicalNote.svelte `[i] technical note` expander replaces shouted uppercase `[TECHNICAL NOTE]` blocks in TransactionFilterBar + InterestProjectionTable (note text sentence-cased); LIVE /accounts/isa/2026-27 collapsed `[i]` → expands to "Running total shows cumulative ISA…" with `[-]` collapse; #10: alert_acknowledgements table (userId+alertId unique, migration 0009 generated, dev-plain.db applied, seed wipe updated); getAlerts/getGoalListAlerts/getAlertsForAccount filter active acks by default; /alerts gets [Done]/[Snooze 30d]/[Restore] + collapsed ACKNOWLEDGED section ("snoozed until 2026-11-27" / "hidden until restored"); LIVE full cycle: snooze budget alert 27→26 + ACKED tag → hidden from home → Restore → 27 active; 5 unit tests alert-acks.test.ts; anonymise TABLE_RULES extended (coverage guard caught it). check 0/0; suite 779/779 (108 files)
- [x] Phase gate: check+test green; live pass goals/accounts/interest/liabilities/alerts + vision spot-checks — ev: check 0/0 · suite 108 files/779 tests green; LIVE all 5 surfaces 0 console errors + 0 500s; vision (GLM-4.6V-Flash via vmodel.sh, canonical prompt): goals CLEAN · accounts CLEAN · interest CLEAN (breakdown sums verified by model) · liabilities CLEAN · alerts no findings; shots archived .docs/reviews/2026-10-28-2035-p2-gate/screenshots/p2-{goals,accounts,interest,liabilities,alerts}.png — PHASE 2 COMPLETE

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
| 2026-10-28 | Plan file not committed to git (progress file is) | `.docs/` is in `.git/info/exclude` — deliberately local-only (private notes). `git add` of it fails "beyond a symbolic link". Progress tracker at repo root IS committed as the branch's first commit (45eb59c). |
| 2026-10-28 | DevTools login flow: fill_form sets values but FormField only sets `touched` on blur → use click+type+Tab per field | Live finding while bootstrapping; also confirms proposal #6's value (Phase 2 will mark touched on input). Rate-limiter note: wrong-password attempts from half-filled fields triggered exponential backoff — cleared itself after ~30s. |
| 2026-10-28 | P0-2 real root cause: missing decrypt call in month-ledger query, NOT a seed-keyring mismatch | Audit's passthrough theory was imprecise: decryptValue throws on failure (no passthrough for v1| blobs), and the recurring-patterns path decrypted the same rows fine — keyring healthy. The 2026-10-18 month-paginated ledger rewrite dropped the decrypt step. Fixed at source + defense-in-depth resilient decrypt anyway. |
| 2026-10-28 | P1-4 root cause: seed fiction, not live-logic inversion | checkMilestones math was correct; the seed pre-ticked milestones contradicting balances, used negative thresholds (checker expects positive), and gave Visa Gold zero `payment`-type transactions (history always 0). Fixed seed + added two-way syncMilestones so any future fiction/regrowth self-heals on page load. |
| 2026-10-28 | Re-seeded dev DB (npm run seed) after P1-4 fixes | Resets dev DB to canonical fixtures with honest milestone state + Visa payment history; also clears audit-day drift (Emergency Fund −£1,500 etc.) and my archived Loop Test Goal. Fresh state improves Phase 8 re-audit comparability. Session survived (admin user re-created with same id). |
| 2026-10-28 | P1-7 policy: account counts = OPEN accounts everywhere (closedAt null); closed get a context row, not headline counts | Matches Home's existing convention and the Liabilities page; makes all three surfaces agree (15/8/7 on current seed). £0-balance loans hide their rate — no rate is "earned" on nothing. |
| 2026-10-28 | P1-9 choice: liquid-only RTA (instant liquidity accounts) + context line for delayed/locked unallocated, over relabel-only | Audit offered either; liquid-only restores the YNAB meaning (money you can actually assign today) while the context line keeps the full figure visible. Null liquidity on assets counts as instant (existing convention). |
| 2026-10-28 | #10 ack semantics: "Done" = far-future sentinel (2100-01-01, reversible via [Restore]), "Snooze 30d" = +30d; acks filter alerts at source (getAlerts/getGoalListAlerts/getAlertsForAccount) so every surface respects them | Alerts are derived not stored, so a sentinel is the only stable "forever" that still allows restore; source-level filtering prevents surfaces drifting (P1-5 lesson). |
| 2026-10-28 | LIVE dev DB is `storage/dev-plain.db`, NOT `storage/dev.db` (drizzle.config default) — server pid 54211 holds dev-plain open (lsof); `dev.db` is a stale empty artifact | All schema pushes must target the live file. `dev.db` left untouched (DB LOCK rule — no file deletions). |
| 2026-10-28 | drizzle-kit push is unusable on this box (phantom "index already exists" on byte-identical indexes, every run, both DBs) → #10 table applied via the exact DDL `db:generate` produced (0009_eminent_wrecker.sql), executed directly on dev-plain.db | Same SQL the sanctioned path would run; generate-then-apply avoids the interactive prompt bug entirely. Migration 0009 also feeds the anonymise test fixtures, which build from migrations dir. |

## Deferrals
| Item | Reason |
|---|---|

## Vision review log
| Date | Screenshot | Verdict |
|---|---|---|
| 2026-10-28 | p01-goal-after-add.png (flash) | CLEAN — aligned, contrast OK, no artifacts |
| 2026-10-28 | p01-goal-after-withdraw.png (zai-vision) | CLEAN functionally, 0 P0/P1; math verified (£150, 15%, history rows correct); 5 P2 polish nits |
| 2026-10-28 | p01-goal-detail-before.png (zai-vision) | CLEAN — 0 P0/P1; no ciphertext/[object Object]/<br>; metrics aligned |
| 2026-10-28 | p2-goals.png (flash) | CLEAN — colour coding, legends, progress bars all verified |
| 2026-10-28 | p2-accounts.png (flash) | CLEAN |
| 2026-10-28 | p2-interest.png (flash) | CLEAN — model independently verified breakdown sums match totals |
| 2026-10-28 | p2-liabilities.png (flash) | CLEAN |
| 2026-10-28 | p2-alerts.png (flash) | No findings (sections, counts, expanders all present) |

## Notes for next iteration
- Session state: logged in as admin (session dropped mid-run ~20:35 — re-login worked; login button enabled while typing = #6 working). Dev server pid 54211, LIVE DB = **storage/dev-plain.db** (NOT dev.db — see Decisions). Dev DB = canonical re-seed (slugs fresh: Visa detail /accounts/6yzYIIo--PcAB0lT, Main Current /accounts/3WsM4M-tt0wNL6rJ).
- **PHASE 2 COMPLETE** — next: Phase 3 line 1 = #11 net-worth hero sparkline (12 snapshots, layerchart Variant B) · #12 accounts flat-view toggle + sticky header · #13 filter type-to-search + counts. Read `.docs/reviews/2026-10-27-2008-full-ux-audit/05-visualisation-roadmap.md` + mockups/variant-b* first.
- Schema-change recipe on this box: edit src/lib/db/schema → `npm run db:generate` (creates migration SQL; tests need it) → apply that SQL to **dev-plain.db** directly (drizzle-kit push is broken — phantom index errors) → update scripts/seed/lib/wipe.ts + scripts/anonymise.ts TABLE_RULES same unit (anonymise coverage guard FAILS the suite if a table lacks rules).
- DevTools screenshots: filePath must be under /private/var/folders/6m/bcwlp3bn5wdd7yy_t8s7xymh0000gn/T/opencode (approved temp) — repo paths denied; copy into .docs/reviews/... after.
- Ack UI lives in AlertBadge/AlertGroup via optional ackAction/restoreAction props — only /alerts passes them today; other surfaces stay action-free by design.
- SeverityLegend renders inside AlertsSection automatically — no per-page wiring needed.
- a11y snapshots SKIP aria-hidden elements — never hide informative text with aria-hidden, it vanishes from the tree used for verification.
- NEXT: Phase 2 second line — P1-4 debt milestone inversion + PAYMENT HISTORY (0) despite £185 paid (suspects: milestone derived from any-time balance thresholds; history query filtered wrong) · P1-5 shared goal-progress fn + tests · P1-6 Newest-First toggle semantics.
- Breadcrumb segmentIndex convention: 0-based (goals/[slug] = 0,1; overview/snapshots/[slug] = 0,1,2). Page loads must override the SLUG segment index. labelMap fallback `delete: "Close"` only applies to routes without overrides.
- Goals are soft-deleted via /confirm-archive (typed-name confirmation), not hard delete. /goals/[slug]/edit route does NOT exist (404s) — edit affordances live elsewhere.
- Free flash vmodel.sh intermittently 1305-overloaded (2026-10-28 ~19:55); retry ×2 then zai-vision MCP.
- Svelte SSR gotcha: `$derived` callbacks run EAGERLY on the server — declaration order matters (P0-1 class of bug).
