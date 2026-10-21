# Tasks: crypto-rotation-safety

## 1. Rotation safety (migrate-envelope.ts)

- [x] 1.1 Rework `rotateUserEnvelope`: stage re-encrypted rows + re-wrapped password/recovery slots in memory, then commit everything (ciphertexts, slots, `webauthn-prf` slot revocations) in ONE `db.transaction`; return a `deviceSlotsRevoked` flag
- [x] 1.2 Settings `?/rotateDataKey` action surfaces "device slots revoked — re-enroll your device" when the flag is set
- [x] 1.3 Unit tests: rotation with an enrolled device slot revokes it and unlock returns to L1; simulated mid-rotation throw leaves old state fully decryptable (rollback)

## 2. Migration + registration (auth flows)

- [x] 2.1 Fix `/migrate` action: run `migrateUserEnvelope` first, unlock with returned DataKey; unwrap only on the resume path (slot already exists)
- [x] 2.2 Wrap registration user insert + `enrollPasswordSlot` in one transaction; on slot failure no user row persists
- [x] 2.3 Tests: migrate action succeeds for slot-less user; registration slot-failure leaves username available

## 3. WebAuthn hardening (webauthn.ts)

- [x] 3.1 `writeDeviceSlot`: reject duplicate active `credentialId` (WebAuthnCeremonyError `UNKNOWN_CREDENTIAL`-style code) + test
- [x] 3.2 `deviceMetadata`: throw `EnvelopeError("BAD_FORMAT")` when `prfSalt` missing (remove random fallback) + test
- [x] 3.3 Counter persistence: atomic update scoped slotId+userId (update only the counter — re-read metadata immediately before write or SQL `json_set`) + concurrency test
- [x] 3.4 `expectedOrigins()`: dev ports only when `APP_ENV=development`/unset; otherwise require `WEBAUTHN_EXPECTED_ORIGINS` (fail closed at first ceremony, clear log) + test

## 4. Key hygiene

- [x] 4.1 Unlock action: `crypto.timingSafeEqual` for the 2-of-2 comparison; zeroize both factor buffers on mismatch and on post-device password unwrap failure
- [x] 4.2 `unlockKeyring`: always seal (zeroize) existing state before overwrite, including same-user non-recovery re-unlock
- [x] 4.3 `rotateUserEnvelope`: zeroize old DataKey after commit
- [x] 4.4 `recovery-enroll` `pendingShows`: delete expired entries on read + sweep on insert (mirror `sweepChallenges`)
- [x] 4.5 Unit tests for 4.1–4.4 (zeroize observable via buffer contents; sweep via clock injection or direct expiry set)

## 5. Verification

- [x] 5.1 `npm run check` + `npx vitest run` green
- [x] 5.2 VERSION_HISTORY entry
