# Proposal: auth-session-hardening

## Why

The audit found the full `users` row (Argon2 `passwordHash`, `passwordSalt`, `totpSecret`, `mfaSetupToken`) and the live session `token` serialized into browser-visible page data on six pages, four password-verification endpoints with no rate limiting, and several validation/guard gaps (cross-user `categoryId`, unbounded transaction amounts, unauthenticated `/api/logout` seal, raw user-id recovery cookie, redirect chain gaps).

## What Changes

- All `+page.server.ts` loads return explicit sanitized user DTOs (id/username/createdAt/inactivityTimeout — the `+layout.server.ts` pattern); no page returns `locals.session`
- Session tokens stored as SHA-256 hashes; lookups hash the presented cookie token (existing sessions invalidated — one-time re-login)
- `/api/logout` seals only for requests carrying a valid session
- Rate limiting (`checkRateLimit`/`recordFailedAttempt`) on `migrate`, `changePassword`, `rotateDataKey`, `setNewPassword` (recovery re-enroll), and registration (IP-scoped basic cap)
- Transaction form: reject non-finite/absurd amounts (mirror importer's £10m cap); `categoryId` resolved against the caller's own categories (drop foreign ids)
- `recovery-enroll` cookie stores a random single-use server-mapped token, not a raw user id; no username disclosure to unauthenticated callers
- `sanitizeRedirectTo` blocks the full ceremony set (`/unlock`, `/logout`, `/recovery-enroll`, `/migrate` in addition to current three)
- Document the global `settings` table decision (single-owner app; scoped per-user if multi-user ever enabled)

## Capabilities

### New Capabilities

- `auth-session-hardening` — page-data DTO sanitization, hashed session tokens at rest, authenticated logout, rate-limit coverage on every credential-verification endpoint, and input/redirect guard rules

### Modified Capabilities

(none — existing specs' requirements are unchanged)
