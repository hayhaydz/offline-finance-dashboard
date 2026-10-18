## ADDED Requirements

### Requirement: All transactions export as one spreadsheet keyed by account
The system SHALL provide an authenticated CSV export containing transactions across all of the user's accounts in a single file, each row carrying `account_slug` and `id`, with importer-compatible columns.

#### Scenario: Full export
- **WHEN** the user exports without filters
- **THEN** one CSV downloads containing every non-deleted account's transactions, each row identified by its `account_slug` and `id`

#### Scenario: Export options scope the file
- **WHEN** the user exports with an account selection, date range, or type filter
- **THEN** the CSV contains only transactions matching all selected filters, in the same single-file format

#### Scenario: Export is user-scoped
- **WHEN** an export request is made
- **THEN** only transactions belonging to the requesting user are ever returned, enforced via the user filter

### Requirement: Import preview matches the accounts page ledger
The import wizard's preview SHALL render transactions with the same monthly grouping (month headers, inflow/outflow/net) as the account detail ledger, so mistakes are visible before completing an import.

#### Scenario: Preview grouping
- **WHEN** the import preview renders a file containing three months of rows
- **THEN** it shows three month-grouped sections with per-month totals in the same format as the accounts page
