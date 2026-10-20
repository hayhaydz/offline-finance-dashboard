# OWASP ASVS V2/V6 Mapping — Envelope Encryption Keyring

Verification pass for `openspec/changes/envelope-encryption-keyring`.
Each relevant control from ASVS V2 (Authentication) and V6 (Cryptography)
maps to a test, a code location, or a documented decision.

## V2 — Authentication

| Control | Requirement (abridged) | Status | Evidence |
|---|---|---|---|
| V2.1 Password security | Verify user set passwords are at least 12 chars and allow long/passphrase input | Pass | `register`/`changePassword` 12-char minimum; Argon2id hashing (`src/lib/auth/password.ts`) |
| V2.1.1 | No length cap below 64 / no truncation | Pass | No upper truncation on password fields |
| V2.2.1 | Rate-limit credential guessing | Pass | `src/lib/security/rate-limiter.ts` — lockout + delay; unwrap failures also recorded (login action + `tests/integration/auth-bypass.test.ts`) |
| V2.2.2 | Generic error messages (no enumeration) | Pass | "Invalid credentials" everywhere; dummy-hash timing equalizer in login action |
| V2.3 Session fundamentals | Server-side session validation on every request | Pass | `src/hooks.server.ts` session check |
| V2.3.1 | Unique session token, ≥64 bits entropy | Pass | 32-byte CSPRNG hex tokens |
| V2.5.2 | Session expiry on inactivity + re-auth with stated reason and return URL | Pass | Client timer (single-fire, in-flight post deferral) + server 24h enforcement; expiry ALSO seals the keyring (spec session-expiry-reliability, MODIFIED). `tests/unit/session-timer.test.ts` |
| V2.5.3 | Logout fully terminates session | Pass | `/logout` + `/api/logout` delete session AND wipe the DataKey (seal) |
| V2.6.1 | Look up secrets by approved crypto (no plaintext comparison) | Pass | Argon2id verify only |
| V2.6.2 | Rate-limit AND delay on credential failure | Pass | rate-limiter lockout + delay countdown |
| V2.8.1 | MFA codes are CSPRNG and server-verifiable only with secret | **Decision: removed** | TOTP deleted — a server-decryptable symmetric code secret violates the custody model (spec unlock-ceremony: "system never verifies a factor it can generate itself"). Replacement factor: WebAuthn PRF device slot (L2, pending approval gate 6.0) |
| V2.8.x | MFA rate limiting / no fallback downgrade | Pass | Recovery passphrase unwrap is rate-limited like the password; recovery unlock forces credential re-enrollment before any data route |
| V2.9 | Recovery by passphrase, not hint/reset | Pass | CSPRNG 12-word EFF diceware, shown once, wallet semantics acknowledged (3 consequences) before acceptance |
| V2.10 | Storage of secrets: hashed (Argon2id) | Pass | Auth hashes; recovery paper stored only as a GCM-wrapped slot copy |

## V6 — Cryptography

| Control | Requirement (abridged) | Status | Evidence |
|---|---|---|---|
| V6.1.1 | Use approved modes (GCM), no ECB/none | Pass | `node:crypto` AES-256-GCM everywhere (`envelope.ts`, `value-codec.ts`) |
| V6.1.2 | IVs are CSPRNG, unique per encrypt | Pass | 12-byte random IVs per wrap/value (`tests/unit/envelope.test.ts` uniqueness assertions) |
| V6.1.3 | Authenticated encryption with AAD binding | Pass | AAD binds slot identity / value location; transposition rejected (value-codec tests) |
| V6.2.1 | All keys CSPRNG | Pass | `crypto.randomBytes` DataKey/salts/slot ids; diceware selection rejection-sampled |
| V6.2.2 | Key derivation Argon2id with OWASP params | Pass | 64 MiB / t=3 / p=1 / 32-byte, matching auth-hash cost (`slot-keys.ts`) |
| V6.2.3 | Per-user/per-purpose key separation | Pass | HKDF-SHA256 domain separation (`info="ofd-envelope-v1"`); derived key ≠ auth hash (unit test) |
| V6.3.1 | No hardcoded keys/passwords | Pass | Secrets only in env/gitignored files; no keys in code |
| V6.3.2 | No legacy weak crypto (DES, MD5, SHA1) | Pass | grep-verifiable: only GCM + HKDF-SHA256 + Argon2id |
| V6.4.1 | Access control decides secrets, defense in depth | Pass | Value-layer ciphertext unreadable even with full DB + file-layer key (cold-tier threat model) |
| V6.4.2 | Direct object references protected per user | Pass | RLS (`withUserFilter`) unchanged + AAD userId binding on slots; slot revocation scoped to owner |
| V6.4.3 | Random IDs to prevent enumeration | Pass | `slotId` 128-bit hex, never URL-exposed; slugs unchanged (nanoid 21) |

## Notes

- L2 (implemented, enrollment dark until live verification):
  UV is enforced from the signed assertion (`requireUserVerification: true`
  + `userVerified` check — `tests/unit/webauthn-ceremony.test.ts`), PRF
  capability is probed before any slot is written, credentials are stored
  per-slot (id/public key/counter) with counter updates for replay
  protection, and 2-of-2 unwrap agreement is enforced at the action level
  (`tests/integration/unlock-ceremony.test.ts`). The live phone
  verification record lives in `.docs/notes/2026-10-20/` (task 6.4).
- Full test suite: `npm run check` + `npm test` green at time of writing
  (664 tests, including 34 envelope/keyring/lifecycle-specific ones).
