# auth-session-hardening Delta

## ADDED Requirements

### Requirement: Page data never contains secret material
No browser-visible load payload SHALL include password hashes, salts, TOTP/MFA material, or session tokens. Pages SHALL return explicit user DTOs limited to non-secret fields.

#### Scenario: Settings profile load
- **WHEN** any authenticated page load returns user data
- **THEN** the payload contains only explicitly whitelisted non-secret fields and never the session record

### Requirement: Session tokens are stored hashed
Session tokens SHALL be stored only as SHA-256 hashes; token lookup SHALL hash the presented value before querying.

#### Scenario: Stolen database file yields no usable tokens
- **WHEN** the sessions table is read directly from a stolen database file
- **THEN** no row contains a value that can be presented as a session cookie

### Requirement: Logout requires a session
Keyring-sealing side effects of logout SHALL require an authenticated request; unauthenticated POSTs SHALL NOT mutate keyring state.

#### Scenario: Cross-site logout denial
- **WHEN** an unauthenticated cross-site POST hits `/api/logout`
- **THEN** the unlocked keyring state of any user remains unchanged

### Requirement: Every credential verification is rate-limited
Any endpoint that verifies a password, passphrase, or recovery credential SHALL enforce the shared rate limiter (lockout + backoff), including authenticated settings actions and registration.

#### Scenario: Change-password brute force locks out
- **WHEN** an unlocked session submits wrong current passwords repeatedly
- **THEN** the limiter locks the account identically to login attempts

### Requirement: Client-supplied references are ownership-checked
Ids and slugs accepted from the client SHALL be resolved against the caller's own rows before persistence; foreign references SHALL be neutralized.

#### Scenario: Foreign category id
- **WHEN** a transaction is created with a category id owned by another user
- **THEN** the transaction is stored with no category (the id is not persisted)

### Requirement: Redirect targets cannot chain into ceremonies
`redirectTo` validation SHALL reject targets that would bounce the user into another auth or ceremony route.

#### Scenario: Unlock target after login
- **WHEN** a login completes with `redirectTo=/unlock?...`
- **THEN** the redirect falls back to the home route

### Requirement: Recovery enrollment cookies are capability tokens
Recovery-enrollment flow state SHALL be carried by a random single-use server-mapped token, never a raw user id; candidate existence SHALL NOT be disclosed without the token.

#### Scenario: Cookie guessing yields nothing
- **WHEN** an unauthenticated caller sets an arbitrary recovery cookie value
- **THEN** no username or user existence information is returned
