# Design: envelope-encryption-keyring

## Context

Single-user, single-device SvelteKit app (`adapter-node`, better-sqlite3-multiple-ciphers, drizzle). The app is browsed at `localhost` on the same machine that runs the server. Current state:

- DB file encrypted with a static `ENCRYPTION_KEY` from `.env` — which lives next to `storage/prod.db`, so disk theft yields both halves. The server opens the DB eagerly at module import (`src/lib/db/client.ts:170`) with zero user ceremony.
- TOTP 2FA with the secret stored AES-GCM-encrypted under that same system key; the server decrypts it at login to verify codes — a verifier that can generate the factor it verifies.
- `users.passwordSalt` exists, commented "Salt for user key derivation", consumed by nothing — per-user key derivation was anticipated but never built.
- Password hashing is already correct: `@node-rs/argon2`, Argon2id, OWASP 2025-26 parameters (`src/lib/auth/password.ts`).

Threat model (settled during exploration):

| Tier | Attacker has | Must yield |
|---|---|---|
| Cold | disk image / powered-off device / DB file copy | nothing readable |
| Warm | running device, user logged out | nothing until owner unlocks in front of it |
| Hot | live unlocked session | accepted loss — no software defense exists on-device |

The design goal is the first two tiers. The third is documented as an accepted ceiling (memory-resident keys while unlocked; V8 cannot guarantee zeroization).

Community precedents this design deliberately reassembles: LUKS keyslots (slot-wrapped master key), age recipients (wrap-slot envelope), Bitwarden/Vaultwarden (user key wrapped by KDF of master secret), KeePassXC key file (mandatory second physical share), Signal/SQLCipher (encrypted SQLite), W3C WebAuthn L3 PRF (device-held secret). Iron rule: **every cryptographic operation goes through `node:crypto`, `@node-rs/argon2`, `@simplewebauthn/*`, or AndroidX — our code only orchestrates.**

## Goals / Non-Goals

**Goals:**
- Data sealed such that the disk alone can never reassemble the decryption key — password + physical device required by construction (asymmetric custody, not symmetric codes).
- Credentials are wrap slots over an immutable DataKey: add/rotate/revoke without re-encrypting data.
- Custody upgrade path: phone screen-lock UV → custom Android app with own PIN → dedicated hardware key with FIDO2 PIN, each a slot re-wrap.
- Recovery with wallet semantics: generated paper passphrase as break-glass slot; spare-device enrollment as primary fallback.
- Seal-on-idle reusing the existing inactivity timeout model.
- Migration of existing data and removal of TOTP with no plaintext fallbacks in production paths.

**Non-Goals:**
- Multi-user key isolation beyond per-user DataKeys (the users table is effectively single-user; per-user keys still scope the design).
- Client-side E2E encryption (server stores blobs) — would evict all server-side aggregation; explicitly rejected.
- Protecting a live unlocked session from a compromised OS — accepted ceiling.
- Building the custom Android app or hardware-key enrollment UI *in this change* (designed-for, delivered later as slot types).
- Any server-side "forgot password" reset — impossible by design.

## Decisions

### D1: Envelope keyring with immutable DataKey (vs. direct password-derived DB key)

Per user: a random 256-bit `DataKey` encrypts that user's data. Each credential wraps an independent copy: `slot = AES-256-GCM(KDF_credential, DataKey)`. Unlock requires slot-1 (password) AND slot-2 (device) — 2-of-2 assembled in RAM only.

- **Why over direct `KDF(password)` as the DB key**: direct keys force full decrypt/re-encrypt on every credential change and make the device slot impossible to add later. Envelope keeps the DataKey stable forever; L1 (password slot only) is forward-compatible with L2 (device slot) by construction. This is the single most important structural decision.
- **Why 2-of-2 (password AND device) rather than either**: possession of the phone alone or the password alone must not open the data — that is the entire requirement.
- Alternatives rejected: XOR shares of the DataKey (equivalent security, but no independent per-slot re-wrap and worse recovery ergonomics than dual-wrapped copies).

### D2: Password slot derivation — Argon2id + HKDF domain separation

Slot-1 key = `HKDF-SHA256( Argon2id(password, passwordSalt), info="ofd-envelope-v1" )`. The existing `users.passwordSalt` column finally gets its intended use. Login verification continues against the stored Argon2id auth hash (unchanged, OWASP params).

- **Why domain separation**: one Argon2 output must never serve as both auth hash and encryption key; HKDF with an `info` label derives an independent key stream from the same expensive KDF without doubling the 64 MiB cost.
- **Why keep the auth hash at all**: cheap pre-gate before any unlock work; the wrap failure itself must never be the only signal (also prevents using GCM auth-tag errors as an oracle without rate limits).

### D3: Encryption boundary — two layers, both kept

- **File layer (existing)**: SQLCipher-family encryption via `better-sqlite3-multiple-ciphers` stays. Its key becomes a *local, machine-scoped* secret no longer required to be secret for the security claim (it protects page-level scraps/temp artifacts of an opened DB).
- **Value layer (new)**: user-scoped sensitive columns encrypted with the DataKey via `node:crypto` AES-256-GCM (per-row random IV, AAD binds table+row id+column to prevent ciphertext transposition).
- **Why not per-user DB files**: breaks drizzle's single-connection model and the shared schema; column encryption preserves all cross-table server-side queries (interest/tax aggregation) while unlocked.
- **Why keep the file layer**: VACUUM, WAL, and temp files can leak plaintext scraps of recently-decrypted pages; file-layer encryption mops that up.

### D4: Device slot — WebAuthn PRF at localhost, UV required

`@simplewebauthn/server` + `@simplewebauthn/browser`. RP ID `localhost` (a secure context by spec — no HTTPS/cert infrastructure needed for this single-device app). Enrollment: `navigator.credentials.create()` with PRF extension → PRF output wraps a DataKey copy (slot-2). Unlock: `get()` with `userVerification: "required"` → phone screen lock enforced by the OS, `UV=true` cryptographically asserted in the signed response; server rejects `UV=false`.

- **Why PRF/hmac-secret**: it is the only standardized mechanism where a device-held secret never persists on disk yet is re-derivable per ceremony. The authenticator cannot be made to emit it without user verification.
- **Why Android-over-USB phone, not QR/hybrid**: hybrid (caBLE) transport relays through Google/Apple tunnel servers — fails hard-offline. USB roaming works fully local.
- Custody upgrades are new slot types on the same interface (per roadmap in D7); nothing in the envelope knows *which* authenticator holds slot-2.
- Alternative rejected: DIY QR-challenge + companion signer (works offline without WebAuthn, but roll-your-own protocol: replay protection, origin binding, PIN rate limiting all bespoke). Revisit only if the custom-app phase needs it.

### D5: Recovery — paper passphrase slot + spare credential enrollment

- **Break-glass slot**: CSPRNG-generated diceware passphrase (EFF large wordlist, 12 words ≈ 128 bits; never user-invented — human-chosen passphrases are ~30 bits). Shown once at enrollment, printed, stored offline. It wraps a normal slot, so using it = single-factor unwrap (wallet semantics).
- **Primary fallback**: enrolling a second credential (spare key / old phone) as another slot-2 wrap — keeps 2-of-2 intact; losing the primary device is then a non-event.
- **Rotation tiers**: slot rotation (revoke/re-wrap one credential) is instant and routine after device loss. DataKey rotation (re-encrypt everything) is reserved for paper compromise — the only single-object-total-loss credential.
- Recovery flow after paper use: unwrap → immediately enroll fresh password + device slots → optionally retire the exposed paper.

### D6: Lifecycle — sealed-by-default, ceremony to unlock, seal on idle/logout/logout-race

`client.ts`'s eager module-import DB handle is replaced by a keyed state machine:

```
SEALED ──ceremony(password[+device])──► UNLOCKED ──{idle timeout | logout | process exit}──► SEALED
   │                                        │
   └── no DataKey in memory; value-layer      └── DataKey + derived keys zeroed (best-effort
      reads return sealed errors                buffer clears; V8 GC caveat documented)
```

- The DB *file* stays mounted (file-layer key is machine-local); value-layer decryption is impossible while sealed. All `*.server.ts` data access goes through the existing drizzle client, which now throws a typed `SealedError` while sealed — hooks redirect to the unlock page.
- Existing `inactivityTimeout` (minutes) becomes the seal deadline; the session-expiry spec's single-fire and in-flight-post guarantees carry over to sealing.
- Restart of `node build` always boots sealed — crash/reboot = sealed by default, never auto-unlocked.

### D7: Phased custody roadmap (design-for, deliver incrementally)

| Phase | Slot-2 custody | UV source | Territory |
|---|---|---|---|
| L1 | none yet — password-only envelope, seal-on-idle, recovery paper enrolled | password | this change |
| L2 | Android phone, WebAuthn PRF over USB | phone screen lock | this change |
| L3 (future) | custom Android app, Keystore-held share (`androidx.security.crypto`), own app PIN | app-defined PIN | separate change; keyring must accept new slot types without schema change |
| L4 (future) | YubiKey/NitroKey PRF slot | FIDO2 PIN | slot re-wrap only |

Slot-2 wraps are stored as rows in a `credential_slots` table typed by slot kind (`password` | `webauthn-prf` | future kinds), so phases 3–4 add enum values, not migrations of the keyring.

### D8: Dependency policy

New runtime deps: `@simplewebauthn/server`, `@simplewebauthn/browser` only (package.json LOCKED — explicit user approval required before install). Everything else uses existing deps or `node:crypto` built-ins (HKDF, AES-256-GCM). `otplib`/`qrcode` removal follows TOTP deletion.

## Risks / Trade-offs

- **[Wallet semantics: forgotten password + lost paper = permanent data loss]** → enforced enrollment of recovery paper during migration before TOTP removal; UI states the consequence in plain language; spare-credential enrollment prompted at setup.
- **[Hot-tier ceiling: unlocked session readable by compromised OS]** → documented accepted risk; seal-on-idle minimizes exposure windows; `cipher_memory_security` + best-effort zeroization reduce scrap lifetime.
- **[PRF support variance across browsers/authenticators]** → L1 ships independently of WebAuthn; L2 enrollment gates on a live PRF capability probe (`create()` with PRF, verify extension output) before committing the slot; tested on the owner's actual phone + Chrome before rollout.
- **[AAGUID/credential portability: phone replacement orphans slot-2]** → spare enrollment + paper recovery; slot revocation is cheap by design.
- **[GCM unwrap failure as a password oracle]** → Argon2id auth-hash check gates before any unwrap attempt; login/unlock rate limiting carries over; AAD format versioned to allow future algorithm changes.
- **[Dev loose mode reintroduces plaintext paths]** → loose mode remains dev/test-only (existing `PLAIN:`/env-gated pattern), production boot refuses to construct it; anonymiser/seed scripts updated for encrypted columns so test fixtures exercise the real path.
- **[Slot table itself becomes an attack target (delete all slots = denial, not breach)] → backups of the keyring header are safe to make (slots are useless without their secrets); documented as availability, not confidentiality, risk.
- **[Migration complexity: re-encrypting live data under DataKey]** → one-shot migrator run inside an unlocked session, transactional per-table, with verification counts before TOTP columns drop.

## Migration Plan

1. **Schema add** (no data change): `credential_slots` table, encrypted-column metadata; seed/anonymiser updated.
2. **L1 ship**: registration creates DataKey + password slot + enforces paper enrollment; login = unlock ceremony; seal-on-idle live; `.env ENCRYPTION_KEY` demoted to file-layer only.
3. **Existing-user migration**: on first unlock post-upgrade, one-shot migrator encrypts user data columns under DataKey, enrolls recovery paper, then (separate later release) TOTP columns/`mfa-setup` route/`otplib` removed. Each step ships behind the unlock it depends on; rollback before column-drop is "leave data in L1 envelope" (still strictly stronger than today).
4. **L2 ship**: PRF enrollment flow + unlock ceremony requires device slot once enrolled (enrollment is opt-in per user, then mandatory).
5. Rollback strategy: L2 → L1 (drop device-slot requirement) is a setting; L1 → legacy is intentionally impossible after migration (wallet semantics accepted at migration time).

## Open Questions

- Exact column coverage for value-layer encryption (which tables/columns are "sensitive" vs structural)? Draft: balances, amounts, descriptions, notes, income/expenses history; slugs/metadata stay plaintext for routing.
- Should the paper passphrase use SLIP-39 2-of-3 split as an optional escrow variant, or single-paper only for v1?
- Backups: does the owner want a documented "sealed backup" procedure (copy of DB + slot table is safe by construction)?
- Timeout default for seal-on-idle (current `inactivityTimeout` default is 5 minutes) — carry over or lengthen while unlocked-but-active?
