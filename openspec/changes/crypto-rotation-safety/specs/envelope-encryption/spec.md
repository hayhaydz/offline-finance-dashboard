# envelope-encryption Delta

## MODIFIED Requirements

### Requirement: Rotation tiers are distinct operations
Full DataKey rotation SHALL re-encrypt protected data and re-wrap every re-wrappable slot in a single atomic transaction, and SHALL revoke (not re-wrap) device slots that cannot be re-wrapped server-side. A crash at any point SHALL leave either the complete pre-rotation state or the complete post-rotation state — never a mixture.

#### Scenario: Rotation revokes device slots
- **WHEN** a user with an enrolled `webauthn-prf` device slot completes full DataKey rotation
- **THEN** all active device slots are revoked in the same transaction and the rotation result instructs the user to re-enroll a device
- **AND** unlock immediately after rotation succeeds with password only (L1)

#### Scenario: Mid-rotation crash is recoverable
- **WHEN** the process dies during full DataKey rotation
- **THEN** the next unlock yields a DataKey that decrypts every protected row (no row is encrypted under a key no slot wraps)

## ADDED Requirements

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
