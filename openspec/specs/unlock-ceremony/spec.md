# unlock-ceremony Specification

## Purpose
TBD - created by archiving change envelope-encryption-keyring. Update Purpose after archive.
## Requirements
### Requirement: Unlock ceremony assembles the DataKey in memory only
The unlock flow SHALL collect the password (deriving the password-slot key via Argon2id + domain-separated HKDF, reusing the existing `users.passwordSalt`), collect the device share when required, and unwrap the DataKey in process memory. Derived key material SHALL be zeroized best-effort on seal.

#### Scenario: Successful unlock
- **WHEN** a correct password (and, when enrolled, a valid device share) is submitted
- **THEN** the DataKey is assembled in memory, the app transitions to unlocked state, and the user reaches their destination URL

#### Scenario: Wrong password does not reach unwrap
- **WHEN** an incorrect password is submitted
- **THEN** the existing Argon2id auth-hash verification rejects it before any slot unwrap is attempted, under the existing login rate limits

### Requirement: The system never verifies a factor it can generate itself
No authentication or unlock factor SHALL rely on a symmetric secret stored such that the server can produce a valid factor without the user. TOTP, HOTP, and any shared-secret code scheme SHALL NOT be used as an unlock factor.

#### Scenario: No code-based factors exist
- **WHEN** the unlock and settings surfaces are inspected after this change
- **THEN** no TOTP/HOTP verification, authenticator QR setup, or server-decryptable code secret exists anywhere in the codebase

### Requirement: WebAuthn PRF device slot enrollment requires capability proof
Device-slot enrollment SHALL use WebAuthn with the PRF extension at RP ID `localhost`, SHALL verify the authenticator returns a usable PRF output before committing the slot, and SHALL wrap a DataKey copy with that output. The PRF secret SHALL never be persisted server-side.

#### Scenario: Enrollment with PRF-capable authenticator
- **WHEN** the user enrolls their phone (USB, Chrome) and completes the WebAuthn ceremony
- **THEN** a `webauthn-prf` slot row exists whose wrapping key was derived from the PRF output, and no copy of the PRF secret is stored

#### Scenario: Non-PRF authenticator is refused at enrollment
- **WHEN** the presented authenticator does not return a PRF/hmac-secret output
- **THEN** enrollment fails with a clear message, no slot is written, and the user's existing unlock path is unchanged

#### Scenario: Server restart does not require re-enrollment
- **WHEN** the server process restarts after a device slot was enrolled
- **THEN** the slot remains usable because all server-side state needed for verification (credential record, wrapped slot) is persisted, and no device-held secret was ever server-persisted

### Requirement: User verification is cryptographically enforced
Unlock ceremonies with a device slot SHALL set `userVerification: "required"`. The server SHALL verify the signed assertion asserts `UV = true` and SHALL reject assertions where user verification is absent.

#### Scenario: Assertion without UV is rejected
- **WHEN** an authenticator response arrives with `UV = false`
- **THEN** the server rejects the ceremony and the data remains sealed

### Requirement: Device slot is mandatory once enrolled
Once a device slot exists for a user, the unlock ceremony SHALL require it; password-only unlock SHALL be refused for that user. Disabling the device requirement SHALL revoke the device slot explicitly via a settings action guarded by a full unlock.

#### Scenario: Opt-in then locked-in
- **WHEN** a user completes device enrollment and later attempts password-only unlock
- **THEN** unlock fails until the device step is completed

### Requirement: Seal triggers wipe observable state
Sealing SHALL occur on logout, on inactivity expiry (per `session-expiry-reliability`), and on process exit, and SHALL leave the app in the sealed state described by `envelope-encryption`.

#### Scenario: Logout seals
- **WHEN** the user logs out
- **THEN** subsequent data requests are routed to the unlock ceremony and no DataKey remains in memory

#### Scenario: Process exit seals
- **WHEN** the server process terminates for any reason
- **THEN** the next boot starts sealed

### Requirement: Enrollment rejects duplicate credentials
Device-slot enrollment SHALL reject a registration whose credential ID matches an already-active device slot for the user, regardless of client behavior.

#### Scenario: Same key cannot enroll twice
- **WHEN** a client completes enrollment with a credential ID already active for the user
- **THEN** the completion fails with a ceremony error and no second slot is written

### Requirement: Device slot metadata integrity is enforced
Reading device-slot metadata SHALL hard-fail on missing required fields (in particular `prfSalt`) instead of fabricating values; unlock SHALL surface a corruption error, never a wrong-salt evaluation.

#### Scenario: Corrupt slot is reported, not guessed
- **WHEN** an active device slot lacks `prfSalt` in its metadata
- **THEN** loading it throws a format error surfaced as a ceremony failure (no random salt is generated)

### Requirement: Counter persistence is atomic
Assertion counter updates SHALL write only the counter field, scoped to slot and user, without a read-modify-write window.

#### Scenario: Concurrent ceremonies do not regress the counter
- **WHEN** two device ceremonies for the same user complete near-simultaneously
- **THEN** the stored counter reflects the higher reported value (no lost update)
