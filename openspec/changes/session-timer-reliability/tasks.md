## 1. Timer rework

- [ ] 1.1 Rewrite `src/lib/utils/session-timer.svelte.ts`: single `setTimeout` scheduled from `lastActivityAt`; throttled `pointerdown`/`keydown`/`submit` listeners update activity; re-arm on activity and on `inactivityTimeout` change
- [ ] 1.2 In-flight post guard: submission counter around `use:enhance`/fetch paths; expiry deferred (not cancelled) while counter > 0; fires after settle if past deadline
- [ ] 1.3 Warning banner: live countdown in final 60s with `[Stay signed in]` (session ping) and `[Log out]`

## 2. Server expiry UX

- [ ] 2.1 `src/hooks.server.ts`: expiry rejections redirect with a reason parameter (expired vs logged-out) instead of silent redirect
- [ ] 2.2 Login flow: render reason banner; preserve `redirectTo` and return after successful re-auth (audit #21); applies to all redirect-to-login paths
- [ ] 2.3 Multi-tab best-effort: broadcast activity via `storage` event; documented limitation in code comment

## 3. Tests

- [ ] 3.1 Integration tests (fake timers + route harness): idle expiry fires exactly once; timeout-change re-arm; deferral during in-flight post
- [ ] 3.2 Manual acceptance: run the qa-findings/03 controlled-prod checklist; record results in `.docs/notes/2026-10-18/04-auth-stability-and-2fa.md`

## 4. QA

- [ ] 4.1 Re-test the 2026-10-16 symptom (budget filter clicks logging out) alongside `budget-filtering-feedback`; record in note 05
- [ ] 4.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
