# Design: auth-session-hardening

## Context

Audit findings 1–11 (auth domain). The app is single-owner localhost, but the browser is treated as untrusted per AGENTS.md ("Sanitize DTOs") — the six leaking pages violate the repo's own rule.

## Goals / Non-Goals

**Goals:**
- No secret or credential material in any browser-visible payload
- Every endpoint that verifies a password/passphrase is rate-limited
- No cross-user data references accepted from clients

**Non-Goals:**
- Changing session cookie flags/lifetime (already correct)
- CAPTCHA or lockout UX changes
- Multi-user `settings` refactor (documented decision only)

## Decisions

1. **DTO at the source.** Sanitize in each `load` (return explicit field subsets) rather than serializing `locals.user` wholesale; add a grep-able pattern: pages never reference `locals.session` in returned data.
2. **Hashed tokens, same scheme.** `sessions.token` stores `sha256(cookieToken)` hex; hooks/login hash before lookup and on insert. Rotation-free, cheap; invalidates existing sessions once (acceptable — forces re-login at deploy).
3. **Rate limit by username** for the four authenticated password endpoints (same limiter as login/unlock); registration rate-limits by IP (best-effort `x-forwarded-for` absent → remoteAddress) with a high cap.
4. **Ownership, not rejection, for categoryId.** Resolve the id against the user's categories; foreign/unknown ids become `null` (matching "no category") rather than erroring — same UX as the importer.
5. **Recovery cookie = capability token.** Random 32-byte token in the cookie; server-side map token→userId with TTL (mirror the WebAuthn challenge store). Username disclosure requires the token, not a guessable id.
6. **Redirect blocklist** extended to every route that exists to bounce (auth/ceremony set); still same-origin-relative only.

## Risks / Trade-offs

- Session invalidation at rollout (all users re-login once) — acceptable for a single-owner app.
- IP-based registration limiting is weak on localhost (all local) — bounded by the localhost-only host binding.
