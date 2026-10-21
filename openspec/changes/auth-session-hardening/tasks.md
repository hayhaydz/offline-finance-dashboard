# Tasks: auth-session-hardening

## 1. Page-data DTOs (leak fix)

- [x] 1.1 Replace `user`/`session` passthroughs with explicit DTOs in: `settings/profile`, `settings/data`, `overview/snapshots`, `overview/snapshots/create`, `overview/snapshots/[slug]`, `goals/debt/create` (layout's id/username/createdAt/inactivityTimeout shape)
- [x] 1.2 Grep-sweep all `+page.server.ts` loads for `locals.session`/raw `session.user` returns; fix any stragglers
- [x] 1.3 Test: load payloads for those routes contain no `passwordHash`/`token` keys (serialize + key scan)

## 2. Session tokens hashed at rest

- [x] 2.1 `login`: insert `sha256(token)`; hooks lookup hashes the cookie value (shared helper `hashSessionToken`)
- [x] 2.2 Test: session row never stores the raw cookie value; lookup succeeds with raw cookie only
- [x] 2.3 Note in deployment: rollout invalidates existing sessions (one re-login)

## 3. Guards + rate limits

- [x] 3.1 `/api/logout`: seal only when `locals.user` (or session token match) present
- [x] 3.2 Add `checkRateLimit`/`recordFailedAttempt` to: `migrate` password verify, `changePassword`, `rotateDataKey`, `setNewPassword` (recovery-enroll)
- [x] 3.3 Registration: IP-scoped rate limit (cap ~10/hour) + test
- [x] 3.4 Tests: each endpoint locks after threshold; success resets

## 4. Input validation

- [x] 4.1 Transaction form: reject non-finite/out-of-range amounts (importer cap £10,000,000; `Number.isFinite` + bounds) + test (incl. `1e308`)
- [x] 4.2 `createTransaction`: resolve `categoryId` against user's categories; foreign → `null` + test
- [x] 4.3 `sanitizeRedirectTo`: also block `/unlock`, `/logout`, `/recovery-enroll`, `/migrate` + test
- [x] 4.4 `goals/debt/create`: scope the debt-goals lookup with `withUserFilter`

## 5. Recovery cookie token

- [x] 5.1 Replace raw user-id cookie with random single-use token mapped server-side (TTL store, mirror challenge store); no username disclosure without valid token
- [x] 5.2 Tests: invalid/expired token yields no disclosure; enroll path still works end-to-end

## 6. Documentation + verification

- [x] 6.1 Document global `settings` table decision (single-owner; per-user refactor if multi-user) in docs/security/threat-model.md
- [x] 6.2 `npm run check` + `npx vitest run` green
- [x] 6.3 VERSION_HISTORY entry
