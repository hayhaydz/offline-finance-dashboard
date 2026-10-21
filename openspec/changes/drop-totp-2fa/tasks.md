# Tasks: drop-totp-2fa

> 🔒 Covers approvals: package.json (remove `otplib`, `qrcode`), schema change + `db:push` (drop columns/table).

## 1. Code purge

- [ ] 1.1 Delete `src/routes/(auth)/mfa-setup/` and `src/lib/auth/mfa.ts`
- [ ] 1.2 Schema: drop `totp_secret`, `totp_secret_iv` from `users`; drop `backup_codes` table; remove `mfaSetupToken` remnants
- [ ] 1.3 `db:push` (Active Dev rule); update `scripts/seed.ts` same-change
- [ ] 1.4 Sweep references: hooks (redirect blocklist `/mfa-setup` entry + comments), register (placeholder writes + `mfa-setup-token` cookie), log-sanitize list, validation rules, `sanitizeRedirectTo` blocklist, anonymise, `+page.svelte` nav remnants
- [ ] 1.5 package.json: remove `otplib` + `qrcode` (+ lockfile refresh)

## 2. Tests + verification

- [ ] 2.1 Update ~25 test fixtures (drop NOT NULL column inserts; remove backup-code fixtures)
- [ ] 2.2 Add invariant test: no `otplib` import / totp reference in src (grep-style guard test)
- [ ] 2.3 `npm run check` + `npx vitest run` green; fresh seed + migrate + unlock smoke
- [ ] 2.4 VERSION_HISTORY entry (note: second release step of envelope-encryption-keyring complete)
