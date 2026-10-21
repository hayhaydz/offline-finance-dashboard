# unlock-ceremony Delta

## MODIFIED Requirements

### Requirement: The system never verifies a factor it can generate itself
No TOTP, backup-code, or any server-verifiable code factor SHALL exist in the codebase; second factors SHALL be authenticator-held secrets (WebAuthn PRF) with recovery paper as break-glass. All TOTP/MFA code paths, storage, routes, and dependencies SHALL be removed.

#### Scenario: Post-purge invariant check
- **WHEN** the codebase is searched for `otplib`, `totpSecret`, `backup_codes`, or `mfa-setup` routes
- **THEN** no production references remain (test fixtures for the purge itself excepted)
