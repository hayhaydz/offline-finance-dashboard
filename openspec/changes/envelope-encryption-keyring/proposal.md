# Proposal: envelope-encryption-keyring

## Why

This is a single-device app: the server, the code, `storage/prod.db`, and the `.env` holding `ENCRYPTION_KEY` all live on one machine, so the current "encryption" guards a split that never occurs — disk theft yields both halves together. Worse, the TOTP second factor is a shared secret the server itself decrypts at every login (`src/lib/auth/mfa.ts`), so an attacker with the machine can generate valid codes: 2FA in name only. The requirement is custody, not authentication — data that can only be unsealed by combining a password (in the owner's head) with a physical device (phone/hardware key), where the disk alone can never reassemble the key, by construction.

## What Changes

- **BREAKING**: TOTP, backup codes, QR setup, and `mfa-setup` flow are removed. The symmetric-secret model is deleted, not repurposed.
- **BREAKING**: Login becomes an **unlock ceremony** — password (wrap slot 1) + device share (wrap slot 2) assemble a per-user DataKey in memory. L1 ships password-only (1 wrap slot); L2 adds the device share.
- **Envelope keyring**: each user gets a random 256-bit **DataKey** that encrypts their data and is *never stored raw or changed*; credentials (password KDF, WebAuthn PRF secret, recovery passphrase) each wrap a copy of it as **slots**. Adding/rotating credentials re-wraps slots without touching data (LUKS keyslot / age recipient model).
- **WebAuthn PRF device slot**: Android phone over USB at `localhost` (secure context, no HTTPS setup), `userVerification: "required"` (phone screen lock), private secret never leaves the phone.
- **Recovery**: CSPRNG-generated diceware passphrase (printed paper slot, wallet semantics — forget password + lose paper = data unrecoverable), spare device enrollment encouraged, slot rotation (cheap) distinguished from DataKey rotation (full re-encrypt, only on paper compromise).
- **Seal-on-idle**: the existing inactivity timeout becomes a seal trigger — DataKey wiped from memory, DB re-sealed; logout and expiry both seal.
- **`ENCRYPTION_KEY` demoted**: no longer the DB master key; migration path re-seals existing data under the user's envelope.
- **Dev loose mode** (plaintext dev DB) remains but must never be constructible in production code paths.
- Phased custody roadmap captured in design (phone screen lock → custom Android app with its own PIN → dedicated hardware key FIDO2 PIN); the keyring is credential-agnostic so each upgrade is a slot re-wrap, not a migration.

## Capabilities

### New Capabilities

- `envelope-encryption`: per-user DataKey + wrap-slot keyring, sealed/unsealed DB lifecycle, slot invariants (DataKey immutable, disk never holds a reconstructable key), rotation tiers.
- `unlock-ceremony`: the password + device unlock flow, WebAuthn PRF enrollment and verification, user-verification enforcement, localhost origin constraints.
- `recovery-credentials`: recovery passphrase generation/enrollment/verification, spare credential slots, loss/rotation procedures and their failure matrix.

### Modified Capabilities

- `session-expiry-reliability`: expiry and logout now trigger data sealing (key wipe + re-seal) in addition to ending the session; seal MUST be verifiable (post-expiry requests cannot read encrypted data).

## Impact

- **Database lifecycle**: `src/lib/db/client.ts` currently opens the DB at module import with the static env key — must become a sealed-by-default, unlock-on-ceremony lifecycle. Schema: new keyring tables; `users.totp_secret*`/backup-code columns removed (schema change → `scripts/seed.ts` + `scripts/anonymise.ts` updates per repo rules).
- **Routes**: `(auth)/login`, `(auth)/register`, `(auth)/mfa-setup` (deleted), `settings/security` rework; `hooks.server.ts` guards sealed state.
- **Dependencies**: adds `@simplewebauthn/server` + `@simplewebauthn/browser` — `package.json` is LOCKED, approval required. All other crypto via existing `@node-rs/argon2`, `better-sqlite3-multiple-ciphers`, and `node:crypto` (HKDF, AES-256-GCM).
- **Recovery semantics**: password resets become impossible; recovery passphrase is the only break-glass. Existing users must enroll recovery material at migration.
- **Verification**: OWASP ASVS V2/V6 as acceptance checklist; W3C WebAuthn L3 PRF normative for the ceremony; full `npm run check` + `npm test` per repo QA rule.
