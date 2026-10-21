# data-layer-integrity Specification

## Purpose
TBD - created by archiving change data-layer-integrity. Update Purpose after archive.

## Requirements

### Requirement: Tooling writes preserve value-layer encryption
Seed, backup, anonymisation, and maintenance scripts SHALL either encrypt protected-column values with the user's DataKey or preserve existing ciphertext and its AAD bindings verbatim; no tool SHALL write plaintext into a protected column or mutate AAD-bound row identity of ciphertext rows.

#### Scenario: Seeded database is encrypted at rest
- **WHEN** the standard seed completes against a fresh database
- **THEN** all `account_transactions.description`, `account_notes.content`, and `monthly_reviews.notes` values are in `v1|` encrypted format

#### Scenario: Anonymised copy still decrypts
- **WHEN** an anonymised copy contains rows with `v1|` protected values
- **THEN** every protected value decrypts successfully under the original key (AAD intact)

#### Scenario: Backups are encrypted
- **WHEN** a reimport backup is written to disk
- **THEN** the file contents are ciphertext under the user's DataKey (no plaintext descriptions on disk)

### Requirement: Multi-write actions are atomic
User-reachable actions that persist more than one row (account + opening balance, budget config + amendment trail) SHALL commit in a single transaction; partial writes SHALL roll back completely.

#### Scenario: Opening-balance failure rolls back the account
- **WHEN** the opening-balance insert fails during account creation
- **THEN** no account row persists

### Requirement: Seed wipe is complete and referentially clean
The seed wipe SHALL clear every data table including notes, reviews, expenses history, and spending categories, with foreign keys enforced.

#### Scenario: Re-seed produces no duplicates or orphans
- **WHEN** the standard seed runs twice
- **THEN** review rows are unique per (user, month) and no orphaned notes exist
