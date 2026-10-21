# Design: drop-totp-2fa

## Context

Archived task 5.3, gated on "5.1 verified in use" — satisfied: envelope live since 2026-10-20, PRF device slot live-verified on the owner's phone (`.docs/reviews/2026-10-20-2205-prf-live-verification.md`).

## Goals / Non-Goals

**Goals:**
- No TOTP/backup-code code, columns, routes, or deps remain
- Envelope invariant stands: the only second factor is a device-held secret

**Non-Goals:**
- Any change to PRF/recovery flows
- Data migration beyond dropping columns/table (values are placeholders)

## Decisions

1. **Phase order**: code purge first (schema fields still present compiles? No —) — purge schema + code in one change; drizzle `db:push` (Active Dev rule) applies the drop. Tests updated in the same change to keep the suite green.
2. **Backup codes table dropped outright** — never read at runtime (only `generateBackupCodes` wrote fixtures; login never checks).
3. **`/migrate`-era compat**: `mfaSetupToken` column references in hooks/register removed with the rest; redirect blocklist entry `/mfa-setup` stays (cheap defense) even after route deletion? No — remove route AND blocklist entry together; `sanitizeRedirectTo` still rejects non-relative targets.
4. **🔒 Locked-file approvals covered by this change**: package.json (remove 2 deps), schema + db:push (drop columns/table).

## Risks / Trade-offs

- Irreversible column drop — values are placeholders by inspection; no user impact.
- `dev-login` or scripts referencing removed columns would fail loudly at typecheck — covered by sweep tasks.
