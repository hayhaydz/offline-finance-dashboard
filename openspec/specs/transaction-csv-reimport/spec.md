# transaction-csv-reimport Specification

## Purpose
TBD - created by archiving change csv-bulk-edit-workflow. Update Purpose after archive.
## Requirements
### Requirement: Reimport handles insert, edit, and delete in one file
The reimport SHALL treat each CSV row by its key: rows with an `id` are matched and edited (or hard-deleted when `_delete` is set); rows without an `id` are inserted after resolving their `account_slug`; unknown ids, foreign rows, and id/slug mismatches are refused at file level.

#### Scenario: Full round-trip in one file
- **WHEN** a single reimport file contains an edit (id + changed description), a deletion (id + `_delete=1`), and a new row (no id, valid `account_slug`)
- **THEN** all three operations are previewed and, on confirmation, applied together in one atomic transaction

#### Scenario: Foreign or unknown id refused
- **WHEN** a row's `id` matches no transaction, another user's transaction, or an account inconsistent with its `account_slug`
- **THEN** the entire file is rejected identifying the offending rows, and nothing changes

#### Scenario: New row validation
- **WHEN** a row without an `id` contains an invalid type, non-finite amount, or unparseable date
- **THEN** the file is rejected with the row number, matching append-import validation rules

### Requirement: Preview gates the commit with exact changes
Before any write, the reimport SHALL present exact counts (`N inserted / N edited / N deleted / N skipped`) and per-row field diffs, and SHALL apply the whole file atomically only after confirmation.

#### Scenario: Atomicity on invalid row
- **WHEN** the file contains one invalid row
- **THEN** the entire reimport is rejected with the offending row number, and no rows are modified

### Requirement: A pre-import backup is written before every commit
On confirmation, the system SHALL first write a timestamped backup CSV capturing the pre-state of every row the import touches (old values of edited rows, full rows being deleted), offer it for download on the result screen, and only then commit.

#### Scenario: Backup before commit
- **WHEN** a reimport that edits 2 rows and deletes 3 rows is confirmed
- **THEN** a backup CSV containing those 5 rows' pre-state is generated before the commit and downloadable from the result screen

### Requirement: Backup files restore via an explicit recovery mode
Backup files SHALL reimport through an explicit recovery mode that upserts by `id` — existing rows restored to backed-up values, previously deleted rows reinserted with their original ids — while the normal mode never upserts.

#### Scenario: Restoring a deletion
- **WHEN** a backup containing a since-deleted row is imported in recovery mode
- **THEN** the transaction is reinserted with its original `id` and backed-up values

#### Scenario: Recovery is opt-in
- **WHEN** a file containing unmatched ids is imported in normal mode
- **THEN** it is refused (typo protection); only the explicit recovery mode upserts

