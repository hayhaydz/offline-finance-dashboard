# envelope-encryption Specification

## Purpose
TBD - created by archiving change envelope-encryption-keyring. Update Purpose after archive.
## Requirements
### Requirement: Per-user DataKey exists and is never persisted in recoverable form
The system SHALL assign each user a random 256-bit DataKey used for all value-layer encryption of that user's data. The DataKey SHALL exist unencrypted only in process memory between unlock and seal, and SHALL never be written to disk, logs, or any persistent store.

#### Scenario: DataKey absent from all persisted state
- **WHEN** the full database file, WAL, and any backup artifacts are inspected while the app is sealed
- **THEN** no persisted structure contains the DataKey or any single value from which the DataKey can be derived without a credential secret held off-disk

#### Scenario: Fresh boot is sealed
- **WHEN** the server process starts (including restart after crash or reboot)
- **THEN** the app boots in sealed state with no DataKey in memory and no way to construct one without the unlock ceremony

### Requirement: Credentials are wrap slots over an immutable DataKey
The system SHALL store each credential as an independent slot wrapping a copy of the DataKey (`slot = AES-256-GCM(credential_key, DataKey)`), keyed by slot kind (`password`, `webauthn-prf`, `recovery-passphrase`, and future kinds). Adding, rotating, or revoking a credential SHALL only add, rewrite, or remove its slot row — it SHALL NOT re-encrypt user data or change the DataKey.

#### Scenario: Enrolling a new credential does not touch data
- **WHEN** a new credential slot is enrolled for a user with existing encrypted data
- **THEN** only the slot table gains a row; no data row is rewritten and the DataKey is unchanged

#### Scenario: Revoking a slot is immediate and local
- **WHEN** a credential slot is revoked (e.g. after device loss)
- **THEN** subsequent unlock attempts using that credential fail, and no other slot or data row is affected

#### Scenario: Future slot kinds require no keyring migration
- **WHEN** a new slot kind is introduced in a later phase
- **THEN** it is expressed as a new slot-kind value on the existing slot table, with no change to slot storage or data encryption

### Requirement: Unlock requires all enrolled mandatory slots
Unlock SHALL require the password slot and, once a device slot is enrolled for the user, at least one enrolled device slot. In L1 (no device slot enrolled yet) the password slot alone SHALL unlock. The server SHALL NOT be able to complete an unlock without secrets supplied by the user in the ceremony.

#### Scenario: Password alone fails when a device slot is enrolled
- **WHEN** a user with an enrolled device slot submits a correct password without completing the device step
- **THEN** the data remains sealed and no DataKey is assembled

#### Scenario: Device alone fails
- **WHEN** the device share is presented without the correct password
- **THEN** the data remains sealed

### Requirement: Value-layer encryption binds ciphertext to its location
Encrypted columns SHALL use AES-256-GCM with per-row random IVs and additional authenticated data binding table name, row identifier, and column, such that ciphertext moved between rows, columns, or tables fails authentication.

#### Scenario: Ciphertext transposition is rejected
- **WHEN** an encrypted value is copied from one row/column to another
- **THEN** decryption fails the GCM authenticity check and the value is not returned

### Requirement: Sealed state denies data reads and is user-visibly routed
While sealed, all value-layer data access SHALL fail with a typed sealed-state error, and guarded routes SHALL route the user to the unlock ceremony rather than rendering sealed errors as content. After a successful unlock the user SHALL return to the URL they were attempting to reach.

#### Scenario: Sealed data request routes to unlock
- **WHEN** a data-bearing route is requested while sealed and the ceremony completes successfully
- **THEN** the original URL renders with decrypted data

#### Scenario: Sealed state never renders ciphertext or plaintext data
- **WHEN** any data-bearing route renders while sealed
- **THEN** no user data values appear in the response

### Requirement: Rotation tiers are distinct operations
Slot rotation (rewrapping the DataKey for a new/rotated credential) SHALL be available at any time while unlocked and SHALL NOT re-encrypt data. DataKey rotation SHALL be a separate, explicit, full-re-encryption operation reserved for compromise of a single-factor-total credential (the recovery passphrase). Full DataKey rotation SHALL re-encrypt protected data and re-wrap every re-wrappable slot in a single atomic transaction, and SHALL revoke (not re-wrap) device slots that cannot be re-wrapped server-side. A crash at any point SHALL leave either the complete pre-rotation state or the complete post-rotation state — never a mixture.

#### Scenario: Slot rotation after device loss
- **WHEN** a device is lost and its slot is revoked and replaced
- **THEN** the operation completes without rewriting any encrypted data rows

#### Scenario: DataKey rotation after paper compromise
- **WHEN** the recovery passphrase may have been compromised and DataKey rotation is invoked
- **THEN** all encrypted data is re-encrypted under a fresh DataKey and every remaining slot is re-wrapped

#### Scenario: Rotation revokes device slots
- **WHEN** a user with an enrolled `webauthn-prf` device slot completes full DataKey rotation
- **THEN** all active device slots are revoked in the same transaction and the rotation result instructs the user to re-enroll a device
- **AND** unlock immediately after rotation succeeds with password only (L1)

#### Scenario: Mid-rotation crash is recoverable
- **WHEN** the process dies during full DataKey rotation
- **THEN** the next unlock yields a DataKey that decrypts every protected row (no row is encrypted under a key no slot wraps)

### Requirement: The file-layer key is not part of the security claim
The SQLCipher-family file encryption key SHALL continue to protect the database file at rest, but the system's confidentiality SHALL NOT depend on that key's secrecy: possession of the database file together with the file-layer key and all server code SHALL NOT be sufficient to read encrypted user data.

#### Scenario: Full machine-disk compromise yields no plaintext
- **WHEN** an attacker obtains the complete disk contents of the machine (database, `.env`, code)
- **THEN** the user's encrypted data cannot be decrypted without the user's password plus an enrolled device credential

### Requirement: Migration succeeds without a pre-existing password slot
The one-shot migration action SHALL create the password slot from the verified password and unlock with the DataKey the migration produced; it SHALL NOT require unwrapping a password slot before one exists.

#### Scenario: Legacy account migrates on first attempt
- **WHEN** a pre-envelope user submits a valid password at `/migrate`
- **THEN** the migration completes and the keyring unlocks in the same request (no 500, no dependency on a prior slot)

### Requirement: Account creation is atomic
User registration SHALL create the user row and its password slot in one transaction; a failure of either write SHALL leave no partial account.

#### Scenario: Slot enrollment failure leaves no orphan user
- **WHEN** password-slot enrollment throws during registration
- **THEN** the user row is not persisted and the username remains available
