## Context

Most-repeated complaint across notes 04 (2026-05-04, 2026-08-02, 2026-10-16: "logs me out every five seconds"). Rate-limiter deadlock fixed (`b7ce3e4`); the client inactivity timer remains unreliable (audit qa-findings/03 + backlog #8): never fired in a controlled prod test, timeout changes don't re-arm. Server enforces a hardcoded 24h expiry (`hooks.server.ts:83`); per-user `inactivityTimeout` exists (`schema/auth.ts:23`).

## Goals / Non-Goals

**Goals:**
- Timer fires exactly once at the configured timeout; re-arms on timeout change
- Activity detection covers clicks/keys/submits; never fires mid in-flight form post
- Server-side expiry lands on login with a reason + preserved return URL (audit #21 folded in)
- Automated integration test for the three failure modes

**Non-Goals:**
- Sliding server sessions / remember-me; changing the 24h server cap
- Multi-tab heartbeat sync (best-effort via storage event, not a requirement)
- Touch-ID/biometric re-auth

## Decisions

1. **Timer ownership: one `document`-level controller** — rewrite `session-timer.svelte.ts` around a single `setTimeout` scheduled from `lastActivityAt` (timestamp updated by throttled listeners for `pointerdown`, `keydown` — mousemove alone is too weak and causes false negatives on reading-only sessions). Re-arm = any activity or timeout-config change recomputes the remaining delay and reschedules. Exactly-one-timeout invariant kills the double-fire/never-fire class.
2. **In-flight post guard — posts defer, never extend (user decision 2026-10-18)** — a counter around `use:enhance`/fetch submissions; while >0, expiry is deferred (not cancelled) and fires after the post settles if still past deadline. **Form posts are NOT activity** — they never reset `lastActivityAt`; only pointer/keyboard interaction does. Typing data into a form already resets the timer via `keydown`, so real data-entry sessions lose nothing; only automated/programmatic posting fails to keep a session alive, which is the point. This directly targets "logged out while clicking budget filters": the in-flight submission is never destroyed by a race, but a truly idle session dies on schedule.
3. **Server/client relationship documented and enforced** — client timer = UX warning + local redirect; server 24h (or per-user if shorter) = enforcement. A server 401/expired response triggers `redirectTo`-preserving login navigation with the reason banner ("session expired" vs "logged out"), replacing silent redirects.
4. **Warning phase with countdown** — existing banner gains a live countdown in the final 60s with `[Stay signed in]` (pings session) and `[Log out]` actions.
5. **Integration test approach** — fake timers + a headless route harness: (a) idle beyond timeout → exactly one expiry; (b) change `inactivityTimeout` mid-session → re-arm to new deadline; (c) expiry deferred during in-flight post, fires after settle. Controlled-prod checklist from qa-findings/03 becomes the manual acceptance script.

## Risks / Trade-offs

- [Reading-only sessions (no clicks/keys) expire while "in use"] → accepted: expiry means "no interaction", and the warning countdown offers one-click extension.
- [Multi-tab drift] → `storage` event broadcasts activity between tabs best-effort; documented limitation.

## Migration Plan

Replace timer module in place; hooks.server.ts gains reason-carrying redirects. No schema change. Rollback = revert module.
