# Threat Model — Envelope Encryption Keyring

Change: `openspec/changes/envelope-encryption-keyring` (L1 shipped; L2 WebAuthn PRF pending approval gate 6.0).

## The asset and the requirement

Single-user, single-device personal finance data (`storage/prod.db`). The
requirement is **custody, not authentication**: data that can only be
unsealed by combining a password (in the owner's head) with — once L2 lands —
a physical device share, where the disk alone can never reassemble the key,
by construction.

## Attacker tiers

| Tier | Attacker has | Must yield |
|---|---|---|
| **Cold** | Disk image / powered-off device / DB file copy (incl. `.env` + code) | Nothing readable: value-layer ciphertext is AES-256-GCM under a per-user DataKey that exists only as GCM-wrapped slot copies; every unwrap requires an off-disk credential secret |
| **Warm** | Running device, user logged out / sealed | Nothing until the owner unlocks in front of it: fresh boot is sealed; idle expiry + logout wipe the DataKey from memory |
| **Hot** | Live unlocked session on a compromised OS | **Accepted loss** — no software defense exists on-device. Documented ceiling, not a bug |

The design goal is the first two tiers. The third is minimised (seal-on-idle
windows) but cannot be eliminated:

- DataKey and derived keys live in process memory while unlocked; V8 cannot
  guarantee zeroization (GC copies, JIT spills). Best-effort buffer clears
  (`zeroize`, `cipher_memory_security = ON`) reduce scrap lifetime only.
- This ceiling is the same one accepted by LUKS, Bitwarden, KeePassXC and
  every other on-device cryptography deployment.

## Why the old model was security theater

- `ENCRYPTION_KEY` lived in `.env` next to `storage/prod.db` — disk theft
  yielded both halves together. It is now the **file-layer key only**
  (machine-local, mops up page/WAL/temp scraps) and is explicitly not part
  of the confidentiality claim.
- TOTP 2FA verified a secret the server itself decrypted at every login —
  a verifier that can generate the factor it verifies. Removed (L1); the
  keyring replaces codes with custody.

## Construction (LUKS keyslot / age recipient model)

- Per user: random 256-bit **DataKey** (CSPRNG) encrypts sensitive columns;
  it is never written raw anywhere and never changes (except explicit full
  rotation).
- Each credential wraps an independent copy:
  `slot = AES-256-GCM(credential_key, DataKey)` with versioned AAD
  (`slot-kind | userId | slotId`) — a slot moved between users/kinds/slots
  fails authentication.
- Password slot key = `HKDF-SHA256(Argon2id_raw(password, users.passwordSalt), info="ofd-envelope-v1")`
  — domain-separated from the auth hash (which stays the rate-limited login
  gate; a wrong password never reaches unwrap).
- Value layer: AES-256-GCM per value, random IV, AAD binds
  `(table, slug, column)` — ciphertext transposition between rows/columns/
  tables fails authentication.
- Recovery: CSPRNG 12-word EFF diceware (≈128+ bits), shown once, wraps a
  normal slot (single-factor break-glass, wallet semantics).

## Rotation tiers

| Event | Operation | Cost |
|---|---|---|
| Password change | Re-wrap password slot (fresh salt, same DataKey) | Instant; zero data rewrite |
| Device loss (L2) | Revoke device slot, optionally enroll spare | Instant; zero data rewrite |
| Paper compromised | **Full DataKey rotation**: re-encrypt everything, re-wrap all slots, new passphrase | Full table scans; rare by design |

A stolen slot alone never unlocks (2-of-2 once a device slot exists; the
paper is the only single-factor slot and its compromise maps to full
rotation).

## Precedents deliberately reassembled

LUKS keyslots (slot-wrapped master key) · age recipients (wrap-slot
envelope) · Bitwarden/Vaultwarden (user key wrapped by KDF of master
secret) · KeePassXC key file (mandatory second physical share) ·
Signal/SQLCipher (encrypted SQLite at the file layer) · W3C WebAuthn L3 PRF
(device-held secret, L2).

**Iron rule:** every cryptographic operation goes through `node:crypto`,
`@node-rs/argon2`, `@simplewebauthn/*` (L2), or AndroidX (L3) — application
code only orchestrates.

## Residual risks & decisions

- **Wallet semantics**: forgotten password + lost paper = permanent data
  loss. Stated at enrollment with explicit acknowledgement; no reset path
  exists by design (verified: no endpoint can modify slots without an
  authenticated, unlocked ceremony).
- **Value-layer column coverage (v1 decision, from design open question)**:
  free-text personal columns (transaction descriptions, note bodies, review
  notes) are DataKey-encrypted. Numeric amounts stay file-layer-only —
  they feed SQL `SUM` aggregation across the codebase, which column
  encryption cannot support; extending coverage is DataKey-stable (a later
  change re-wraps nothing).
- **Slot table as denial target**: deleting all slots = lockout (availability
  risk), never a confidentiality breach. Backing up the keyring rows is safe
  by construction.
- **GCM unwrap as an oracle**: gated behind the rate-limited Argon2id auth
  hash; unwrap failures count as failed login attempts.
- **Dev loose mode**: plaintext dev DB constructible in development only;
  production boot refuses missing `ENCRYPTION_KEY` and any `PLAIN:` path.
- **Migration window**: legacy plaintext rows pass through `decryptField`
  until the one-shot migrator converts them in the same session that first
  unlocks; the migrator is single-transaction (atomic) and verified by row
  counts.
