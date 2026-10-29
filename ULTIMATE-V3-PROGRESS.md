# ULTIMATE v3 Release — Progress
Branch: release/ultimate-3.0 · Base: release/ultimate-2.0 @ 6e34352 · Started: 2026-10-29T19:11:24+00:00

## Time ledger
| Session start | Session end | Elapsed | Work done |
|---|---|---|---|
| 2026-10-29 19:11:24 GMT | 2026-10-29 19:14:46 GMT | 0h 03m | Sweep 0: progress file, casing fix, check/test/build baseline, live login verified |

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
| R1 | [ ] | full desktop viewport, no-wrap, mobile = zoomed-out desktop |
| R2 | [ ] | sealed root — "logged out, data is sealed" landing |
| R3 | [ ] | home header revert + viz gallery (click-to-switch) |
| R4 | [ ] | goal bars revert (remove black milestone lines) |
| R5 | [ ] | rate heatmap full width |
| R6 | [ ] | goals allocation full width |
| R7 | [ ] | credit modes: panic vs stooze |
| R8 | [ ] | Monzo-method transactions (pay-off-now vs over-time cost) |
| R9 | [ ] | budget UX redesign |
| R10 | [ ] | reports v2 — dated science-paper-style focused reports |
| R11 | [ ] | tax page — kill wall of text |
| R12 | [ ] | alerts digestibility |
| R13 | [ ] | tools expansion — sub-pages + more tools |
| R14 | [ ] | data management overhaul (core architecture redesign) |
| R15 | [ ] | transaction editability judgment (research Matrixify DROP/CREATE) |
| R16 | [ ] | top bar — fix `[[⌘K]]` double render, de-crowd |
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
| R-H* | — | harvested items appended as discovered (≥5 to implement before stop) |

## Block registry
| Block | Last sweep | BLOCK CYCLE stage | Notes |
|---|---|---|---|
| B01 SHELL & VIEWPORT | — | unvisited | R1 R2 R16 · sweep-1 ★ first |
| B02 HOME | — | unvisited | R3 · sweep-1 ★ |
| B03 GOALS | — | unvisited | R4 R6 · sweep-1 ★ |
| B04 ACCOUNTS & LIABILITIES | — | unvisited | R5 R17 · sweep-1 ★ |
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
### B01 SHELL & VIEWPORT
- (pending sweep 1)

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

## Deferrals
| Item | Reason |
|---|---|

## Vision review log
| Date | Screenshot | Verdict |
|---|---|---|

## Notes for next iteration
- **Sweep 0 COMPLETE** (19:14:46 GMT). Next: **Sweep 1 — BIG VISIBLE CHANGE (B01–B04)** per plan §6.3. Start with B01 SHELL & VIEWPORT BLOCK CYCLE: RESEARCH (git show main:<path> for "before" states) → JUDGE → PLAN (≤5 edit units) → EDIT → SELF-REVIEW.
- Dev server: RUNNING in background (shell ID sh_189153b0a001cp8sLuyUCzricQ) at http://127.0.0.1:5173. If dead on resume: `npm run dev` background:true.
- CDP browser: page 1 authenticated session active at `/` — sessions die <60s after login; re-login per Appendix B pattern (navigate → snapshot → fill uid×2 → click → poll in ONE evaluate_script).
- Baseline observation for B01/R2: unauthenticated `/` already lands on `/login?reason=logged-out&redirectTo=%2F` showing "You have been logged out. Data is sealed." — R2 may be partially satisfied by v2 already; verify the "clear path to log in" criterion properly in B01's cycle before ticking.
- Casing gotcha: this worktree materializes TRUE git casing (main checkout FS is case-insensitive and had masked it). If more casing errors surface, fix imports to git casing (`git ls-files` is truth).
- `.docs/VERSION_HISTORY.md` did not exist in the worktree — created at Sweep 0 close.
- Ledger discipline: end-times from fresh `date` AFTER work; correct drift DOWN only.
