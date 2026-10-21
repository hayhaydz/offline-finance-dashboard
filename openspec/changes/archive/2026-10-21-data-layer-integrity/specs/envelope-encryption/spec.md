# envelope-encryption Delta

## MODIFIED Requirements

### Requirement: Value-layer encryption binds ciphertext to its location
Value-layer encryption SHALL apply to every write path — application actions, seed fixtures, and tooling — using the per-user DataKey via AES-256-GCM with AAD binding (table, row id, column); tooling SHALL NOT write plaintext into protected columns or alter the row identity of rows bearing protected ciphertext.

#### Scenario: Seed fixture write is encrypted
- **WHEN** the seed inserts a transaction with a description
- **THEN** the stored value is `v1|` ciphertext decryptable only with the seeded user's DataKey and the correct (table, slug, column) AAD
