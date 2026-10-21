# Design: crypto-rotation-safety

## Context

Audit findings 1–3 + minors 4–13 (crypto domain) from the pre-v1.1.0 whole-codebase audit. The envelope keyring is live (L1+L2 shipped 2026-10-20, archived `envelope-encryption-keyring`); rotation is reachable from settings/security ("Emergency: recovery paper compromised") and `/migrate` is the hooks-enforced gate for pre-envelope accounts.

## Goals / Non-Goals

**Goals:**
- No reachable state where unlock is impossible without recovery paper
- No crash window that loses plaintext during rotation
- WebAuthn enrollment rejects incoherent slot writes
- DataKey material zeroized on every path that discards it

**Non-Goals:**
- Re-wrapping device slots server-side (impossible by design — the PRF output exists only during a ceremony)
- Changing slot/wrap formats or the value-layer codec
- Rate limiting (covered by `auth-session-hardening`)

## Decisions

1. **Rotation = stage-then-commit.** Re-encrypt all protected rows into memory under the new DataKey first (as `migrateUserEnvelope` already does), re-wrap password + recovery slots in memory, then commit ciphertexts + slots + device-slot revocations in ONE `db.transaction`. A crash before commit leaves the old coherent state; after commit, the new one.
2. **Device slots are revoked, not re-wrapped.** `rotateUserEnvelope` revokes active `webauthn-prf` slots in the same transaction and returns a flag so the settings action can tell the user to re-enroll the device. Unlock enforcement stays slot-existence-based, so revocation restores password-only unlock (L1) — never a brick.
3. **Migrate before unwrap.** `/migrate` runs `migrateUserEnvelope` (which creates the password slot from the verified password) and unlocks with the returned DataKey. `unwrapPasswordSlot` is only called when a slot already exists (resume path).
4. **Hard failures over fabrication.** `deviceMetadata` throws `EnvelopeError("BAD_FORMAT")` for a slot missing `prfSalt` (corruption is surfaced, not papered over with a random salt). `writeDeviceSlot` rejects a second active slot with the same `credentialId`.
5. **Counter via `json_set`.** Counter persistence updates only the metadata counter atomically, scoped by slotId+userId, killing the read-modify-write race.
6. **Origins by environment.** `expectedOrigins()` returns dev ports only when `APP_ENV === "development"` (or unset); otherwise `WEBAUTHN_EXPECTED_ORIGINS` must be set explicitly (fail closed with a clear startup error).

## Risks / Trade-offs

- Rotation revoking device slots is a UX regression for L2 users post-rotation — unavoidable without the PRF secret; mitigated by an explicit "re-enroll device" message.
- Staging full re-encryption in memory raises peak memory for large datasets — bounded here (single-user personal data, ~thousands of rows); noted for future batching.
- Strict origin pinning may break nonstandard local ports — dev keeps the three known ports.
