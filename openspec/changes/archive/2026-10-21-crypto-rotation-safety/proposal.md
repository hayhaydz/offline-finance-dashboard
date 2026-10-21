# Proposal: crypto-rotation-safety

## Why

The whole-codebase audit (pre-v1.1.0, 2026-10-21) found three major defects in the crypto surface: full DataKey rotation leaves stale device slots (permanently bricking the mandatory 2-of-2 unlock), the rotation is not crash-atomic (a mid-rotation crash loses data irrecoverably), and `/migrate` unwraps a password slot before creating it (always 500 for the only users who need it). Several hardening gaps (duplicate credentials, fabricated salts, non-atomic counters) also need closing before release.

## What Changes

- `rotateUserEnvelope` revokes all active `webauthn-prf` slots alongside recovery re-enrollment (device slots cannot be re-wrapped server-side) and the rotation result surfaces "re-enroll your device"
- `rotateUserEnvelope` becomes crash-atomic: new ciphertexts + slot re-writes staged then committed in ONE synchronous transaction (mirror of the migrate path)
- `/migrate` action calls `migrateUserEnvelope` first and unlocks with the returned DataKey; unwrap only runs on resume when a slot already exists
- Registration wraps user insert + password-slot enrollment in one transaction (no partial account that bricks against the fixed `/migrate`)
- WebAuthn hardening: `writeDeviceSlot` rejects duplicate credential IDs; `deviceMetadata` hard-fails on missing `prfSalt` instead of fabricating a random salt; counter updates are atomic (scoped `json_set`, no read-modify-write)
- Key hygiene: `crypto.timingSafeEqual` for the 2-of-2 key comparison; DataKey buffers zeroized on all failure/exit paths; same-user re-unlock seals existing state before overwriting; recovery passphrase `pendingShows` entries swept on expiry
- WebAuthn expected origins narrow to environment-derived values (dev ports in development only; `WEBAUTHN_EXPECTED_ORIGINS` required outside development)

## Capabilities

### New Capabilities

- `key-hygiene` — in-memory DataKey lifecycle rules (zeroization on failure/exit paths, constant-time key comparison, single live keyring state per process)

### Modified Capabilities

- `envelope-encryption` — rotation tier requirements extended: rotation revokes device slots and is crash-atomic; migration resumes without pre-existing slots
- `unlock-ceremony` — enrollment hardening: duplicate credential rejection, salt integrity, atomic counter persistence
