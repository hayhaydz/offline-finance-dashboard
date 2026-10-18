## Why

Random forced logouts are the most-repeated complaint across the personal notes (2026-05-04, 2026-08-02, 2026-10-16: "logging me out every five seconds", "clicking budget filters logs me out"). The rate-limiter deadlock half was fixed (`b7ce3e4`), but the client-side inactivity timer remains unreliable per audit qa-findings/03 + backlog #8 (`.docs/notes/2026-10-13/`): it never fired in a controlled prod test, and changing the timeout doesn't re-arm it. An unreliable timer cuts both ways — spurious logouts and missed logouts.

## What Changes

- **Timer rework**: replace/rework the session-timer `$effect` (`src/lib/utils/session-timer.svelte.ts`) so that (a) it fires exactly once at the configured inactivity timeout, (b) changing `inactivityTimeout` re-arms the running timer, (c) activity detection covers clicks, keys, and form submits (not just mousemove), and (d) it never triggers during an in-flight form post.
- **Server/client expiry alignment**: the server's hardcoded 24h expiry (`src/hooks.server.ts:83`) and the per-user `inactivityTimeout` (`src/lib/db/schema/auth.ts:23`) need one documented relationship — client timer is the UX warning, server expiry is the enforcement; a session killed server-side mid-interaction must land the user on login with a message, not a silent redirect.
- **Warning phase with countdown + redirectTo**: the pre-expiry warning banner gets a live countdown and, on any redirect-to-login, the original URL is preserved and returned to after re-auth (audit #21).
- **Integration test**: an automated test covering expiry-while-idle, timeout-change-re-arm, and expiry-mid-post (the "logged out while clicking" scenario).

## Capabilities

### New Capabilities

- `session-expiry-reliability`: Inactivity logout fires exactly when configured, re-arms on timeout changes, never races in-flight form posts, and redirects preserve return URLs with a visible reason

### Modified Capabilities

(none)

## Impact

- **Files**: `src/lib/utils/session-timer.svelte.ts`, `src/hooks.server.ts`, `src/routes/(auth)/login/*` (redirectTo), session banner component, `src/lib/db/schema/auth.ts` (no change expected — documented relationship only)
- **Tests**: new integration test file(s); the audit's controlled-prod-test checklist becomes the acceptance script
- **Acceptance**: the 2026-10-16 symptom ("clicking budget filter toggles logs me out") no longer reproduces after this change plus `budget-filtering-feedback`'s form-feedback fix
