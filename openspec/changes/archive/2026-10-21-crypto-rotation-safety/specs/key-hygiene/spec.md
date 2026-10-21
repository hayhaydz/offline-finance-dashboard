# key-hygiene Specification

## ADDED Requirements

### Requirement: Key material is zeroized on discard
Every code path that discards a DataKey buffer (failed 2-of-2 comparison, unwrap failure after one factor succeeded, rotation's old key, keyring overwrite) SHALL zeroize the buffer before dropping the reference.

#### Scenario: Mismatched factors leave no key residue
- **WHEN** the password and device factors unwrap different DataKeys at unlock
- **THEN** both buffers are zeroized before the failure response is returned

### Requirement: Key equality checks are constant-time
Comparisons of key material SHALL use a constant-time primitive.

#### Scenario: 2-of-2 agreement check
- **WHEN** the unlock ceremony compares the two factor-derived DataKeys
- **THEN** the comparison uses `crypto.timingSafeEqual` on equal-length buffers

### Requirement: One live keyring state per process
Overwriting unlocked keyring state (including same-user re-unlock) SHALL seal and zeroize the previous state before assigning the new one.

#### Scenario: Re-unlock while unlocked
- **WHEN** an already-unlocked user completes another unlock ceremony
- **THEN** the previous DataKey is zeroized via the seal path before the new state is stored

### Requirement: Pending recovery passphrases do not outlive their TTL
One-time recovery passphrase disclosures held in process memory SHALL be deleted when expired, not only when consumed.

#### Scenario: Expired disclosure is swept
- **WHEN** a pending recovery passphrase show entry passes its expiry
- **THEN** a subsequent read or insert removes it from memory
