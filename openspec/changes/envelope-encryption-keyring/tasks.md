# Tasks: envelope-encryption-keyring

## 1. Crypto core (pure, testable, zero routes)

- [ ] 1.1 Create `src/lib/server/crypto/envelope.ts`: DataKey generation (CSPRNG 256-bit), slot wrap/unwrap via `node:crypto` AES-256-GCM with versioned AAD (`slot-kind`, user id, slot id), unit tests incl. tamper/wrong-slot rejection
- [ ] 1.2 Implement password-slot key derivation: Argon2id(password, `users.passwordSalt`) → HKDF-SHA256 with `info="ofd-envelope-v1"`; unit-test domain separation (derived key ≠ usable as auth hash, stable across calls)
- [ ] 1.3 Implement value-layer column codec: AES-256-GCM per-row random IV, AAD binding table/row-id/column; unit tests for transposition rejection, round-trip, format versioning
- [ ] 1.4 Unit-test the rotation tiers: slot re-wrap leaves ciphertext bytes untouched; DataKey rotation produces new ciphertext + re-wrapped slots

## 2. Schema & sealed DB lifecycle

- [ ] 2.1 Add `credential_slots` table to `src/lib/db/schema/auth.ts` (id, userId, kind: `password|webauthn-prf|recovery-passphrase`, wrappedKey, iv, credential metadata, createdAt/revokedAt) — no TOTP column drops yet
- [ ] 2.2 Update `scripts/seed.ts` for the new table (repo rule: seed updates immediately on schema change) and add envelope fixtures
- [ ] 2.3 Refactor `src/lib/db/client.ts`: replace eager module-import unlock with a sealed/unlocked state machine — DB file opens with machine-local file-layer key; DataKey held only in unlocked state; typed `SealedError` exported
- [ ] 2.4 Demote `ENCRYPTION_KEY` to file-layer only (rename in docs/.env.example: no longer claims data confidentiality); production boot refuses any plaintext/`PLAIN:` path (extend existing startup checks)
- [ ] 2.5 Guard `hooks.server.ts`: data-bearing requests while sealed redirect to unlock with reason + return URL (per session-expiry spec); no ciphertext or data values render while sealed
- [ ] 2.6 Wire seal-on-idle/logout/process-exit: DataKey zeroization (best-effort buffer clears), single-fire expiry preserved, in-flight post deferral preserved (update existing session timer tests)

## 3. L1 unlock ceremony & account lifecycle

- [ ] 3.1 Rework login flow: verify Argon2id auth hash first (rate-limited), then unwrap password slot → DataKey in memory; wrong password never reaches unwrap
- [ ] 3.2 Rework registration: generate DataKey + password slot, require recovery enrollment in the same session (per recovery spec)
- [ ] 3.3 Replace `settings/security` 2FA section with keyring status (slots, spare prompt, revocation, paper re-enrollment guard)
- [ ] 3.4 Unlock page UI (terminal aesthetic): password step, later device step placeholder, return-URL handling, "session expired/sealed" reason messaging
- [ ] 3.5 Password change flow: verify old password, unwrap, re-wrap password slot only (no data rewrite); inactivity timeout setting carried over as seal deadline

## 4. Recovery credentials

- [ ] 4.1 Implement 12-word EFF diceware generator (CSPRNG, ≈128 bits), display-once enrollment with the three stated wallet consequences and explicit acknowledgement
- [ ] 4.2 Recovery unlock path: passphrase unwrap → recovery-initiated session → forced re-enrollment of password (+ device if enrolled) before any data-bearing route
- [ ] 4.3 Spare-device prompt in settings when only one device slot exists; slot list with revoke actions and "stolen slot alone cannot unlock" note
- [ ] 4.4 Recovery-compromise rotation action: full DataKey re-encryption + all-slot re-wrap + new passphrase shown once (behind full unlock)

## 5. Migration of existing data

- [ ] 5.1 One-shot migrator (runs inside an unlocked session, transactional per table): encrypt sensitive columns under DataKey, enroll recovery paper, verify row counts before commit
- [ ] 5.2 Update `scripts/anonymise.ts` for encrypted columns + slot table so anonymised fixtures exercise the real path
- [ ] 5.3 Second release step (only after 5.1 verified in use): drop `totp_secret*`/backup-code columns, delete `(auth)/mfa-setup` route + `otplib`/`qrcode` deps, purge `src/lib/auth/mfa.ts` TOTP paths — confirm no server-verifiable code factor remains

## 6. L2 WebAuthn device slot

- [ ] 6.0 Approval gate: user explicitly approves `package.json` additions `@simplewebauthn/server` + `@simplewebauthn/browser` (LOCKED file) — do not install before sign-off
- [ ] 6.1 PRF enrollment flow at RP ID `localhost`: `create()` with PRF extension, capability probe (refuse non-PRF authenticators with no slot written), wrap DataKey copy with PRF output, persist `webauthn-prf` slot + credential record
- [ ] 6.2 Device step in unlock ceremony: `get()` with `userVerification: "required"`, server verifies signed `UV=true`, rejects otherwise; PRF output re-derives slot unwrap
- [ ] 6.3 Enforce device-mandatory-once-enrolled in the unlock path; explicit guarded settings action to revoke the device slot (requires full unlock)
- [ ] 6.4 Live test on owner's actual phone + Chrome over USB at localhost before enabling; document observed PRF/UV behavior in `.docs/`

## 7. Verification & documentation

- [ ] 7.1 Test suite: envelope wrap/unwrap, sealed-state guards, ceremony flows, recovery flow, migration idempotence; full `npm run check` + `npm test` green
- [ ] 7.2 OWASP ASVS V2/V6 pass: map each relevant control to a test or documented decision; record in `docs/security/asvs-mapping.md`
- [ ] 7.3 Write `docs/security/threat-model.md`: attacker tiers table, ceiling statement (hot-tier accepted risk), rotation tiers, precedents (from design.md)
- [ ] 7.4 Update `docs/dev/agent-runbook.md`: sealed boot behavior, unlock requirement for data work, loose-mode dev DB rules
- [ ] 7.5 Update `.docs/VERSION_HISTORY.md` save-point entries per repo convention (no git operations)
