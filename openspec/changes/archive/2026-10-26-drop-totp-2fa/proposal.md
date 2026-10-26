# Proposal: drop-totp-2fa

## Why

Deferred task 5.3 of the archived `envelope-encryption-keyring` change: TOTP is already dead code (login has no MFA step; `mfa.ts` is only referenced by the unreachable `mfa-setup` route; schema columns are vestigial — tests insert the literal string `"REMOVED"`). The second-factor role is now held by the live-verified WebAuthn PRF device slot (L2) with recovery paper as break-glass. Post-v1.1.0 release cleanup.

## What Changes

**BREAKING** (schema): drop `totp_secret`, `totp_secret_iv` columns and the `backup_codes` table
- Delete `(auth)/mfa-setup` route + `src/lib/auth/mfa.ts`
- Remove `otplib` + `qrcode` dependencies (🔒 package.json — approval covered by this change)
- Purge `totpSecret`/`totpSecretIV`/`mfaSetupToken` from: schema, hooks redirect blocklist references, register flow placeholder writes, seed (user fixtures + `mfa-setup-token` cookie), log-sanitize token list, validation rules, redirect-to blocklist (`/mfa-setup` entry)
- Update ~25 test fixtures that insert the NOT NULL columns today
- Confirm: no server-verifiable code factor remains (envelope spec invariant)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unlock-ceremony` — "The system never verifies a factor it can generate itself" requirement now permanent: TOTP/MFA code paths removed entirely
