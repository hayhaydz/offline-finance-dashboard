# unlock-ceremony Delta

## ADDED Requirements

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
