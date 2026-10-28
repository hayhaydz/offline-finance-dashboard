# ULTIMATE Release — Progress
Branch: release/ultimate-2.0 · Started: 2026-10-28T19:29+00:00

## Time ledger
| Session start | Session end | Elapsed | Work done |
|---|---|---|---|
| 2026-10-28T19:29 | 2026-10-28T19:35 | 0h06m | Phase 0 bootstrap: branch, progress file, baseline green, live login OK |
| 2026-10-28T19:35 | 2026-10-28T19:41 | 0h06m | P0-1 GoalDetailCard TDZ fix + 5 SSR smoke tests + live verify |
| 2026-10-28T19:41 | 2026-10-28T19:47 | 0h06m | P0-2 ciphertext leak: ledger decrypt + resilient protected-fields + 7 tests + live verify |
| 2026-10-28T19:47 | 2026-10-28T19:52 | 0h05m | P0-3 error page: errorDisplayMessage helper, reactive SSR render, hooks developerMessage, 9 tests + live verify |
| 2026-10-28T19:52 | 2026-10-28T20:01 | 0h09m | Phase 1 E2E goal money flow live (create→add→withdraw→archive) + 3 vision reviews — PHASE 1 COMPLETE |

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
| 2026-10-28 | Plan file not committed to git (progress file is) | `.docs/` is in `.git/info/exclude` — deliberately local-only (private notes). `git add` of it fails "beyond a symbolic link". Progress tracker at repo root IS committed as the branch's first commit (45eb59c). |
| 2026-10-28 | DevTools login flow: fill_form sets values but FormField only sets `touched` on blur → use click+type+Tab per field | Live finding while bootstrapping; also confirms proposal #6's value (Phase 2 will mark touched on input). Rate-limiter note: wrong-password attempts from half-filled fields triggered exponential backoff — cleared itself after ~30s. |
| 2026-10-28 | P0-2 real root cause: missing decrypt call in month-ledger query, NOT a seed-keyring mismatch | Audit's passthrough theory was imprecise: decryptValue throws on failure (no passthrough for v1| blobs), and the recurring-patterns path decrypted the same rows fine — keyring healthy. The 2026-10-18 month-paginated ledger rewrite dropped the decrypt step. Fixed at source + defense-in-depth resilient decrypt anyway. |

## Deferrals
| Item | Reason |
|---|---|

## Vision review log
| Date | Screenshot | Verdict |
|---|---|---|
| 2026-10-28 | p01-goal-after-add.png (flash) | CLEAN — aligned, contrast OK, no artifacts |
| 2026-10-28 | p01-goal-after-withdraw.png (zai-vision) | CLEAN functionally, 0 P0/P1; math verified (£150, 15%, history rows correct); 5 P2 polish nits |
| 2026-10-28 | p01-goal-detail-before.png (zai-vision) | CLEAN — 0 P0/P1; no ciphertext/[object Object]/<br>; metrics aligned |

## Notes for next iteration
- Created branch from main @ 8a67f0d. Working tree was clean. Audit dir + plan file already committed on main.
- Dev server pid 54211 running (127.0.0.1:5173, strictPort). Browser page 1 logged in as admin (session cookie live). Savings goal detail `/goals/vh_G4FhSzFz8Kj8D` verified post-P0-1.
- Login via DevTools: fill_form alone leaves submit disabled — FormField needs blur (Tab) to mark touched. Type into fields, Tab out, submit. Wrong-password attempts trigger exponential backoff (max 30s).
- Baseline: check 0/0, tests 740/740 green → now 745/745 after P0-1 (+5 SSR tests).
- NEXT: P0-2 ciphertext leak — `decryptField` passthrough in src/lib/server/crypto/protected-fields.ts renders `v1|…` blobs raw in TransactionsSection.svelte:340 ledger. Render `[encrypted]` for v1| blobs in passthrough; then root-cause why seed ciphertext doesn't decrypt under live keyring (check scripts/seed.ts keyring usage).
- Svelte SSR gotcha learned: `$derived` callbacks run EAGERLY on the server — declaration order of deriveds matters. Watch for this pattern in other components (P0-1 class of bug).
