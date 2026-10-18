# expenses-history-tracking Specification

## Purpose
TBD - created by archiving change expenses-historical-record. Update Purpose after archive.
## Requirements
### Requirement: Monthly expenses are recorded per month with unknown gaps
The system SHALL store one monthly expenses record per user per month (`YYYY-MM`) in a user-scoped history table, managed from a dedicated expenses page (`/overview/expenses`), where a present row means the month's expenses are known (including £0) and an absent row means unknown — never zero by default.

#### Scenario: Zero-expenses month is explicit
- **WHEN** the user records £0 for a month
- **THEN** that month is treated as known expenses of £0, distinct from a missing month

#### Scenario: Gaps are visible
- **WHEN** the expenses grid renders a year with missing months
- **THEN** missing months are visibly distinct from entered months (and from £0 months)

### Requirement: Expenses history is viewable as a calendar-year grid
The system SHALL present expenses history as a calendar-year (Jan–Dec) × month grid, newest year first, showing each month's amount, a per-year known-month count, and a per-year total of known months.

#### Scenario: Viewing shifts over time
- **WHEN** the user opens `/overview/expenses` with multiple years of history
- **THEN** the grid renders one row per calendar year with per-month amounts, known-count (e.g. 10/12), and the year's known total

#### Scenario: Single-month edit
- **WHEN** the user clicks a month cell and saves an amount (and optional note)
- **THEN** only that month's record is upserted and feedback renders

#### Scenario: Removing an entry
- **WHEN** the user removes a month's entry
- **THEN** the month becomes unknown (not £0) and feedback renders

### Requirement: Range-fill backfills contiguous months at a fixed amount
The system SHALL provide a range-fill action ("£X per month from month A to month B") that writes the amount to every month in the range, capped at 120 months, with an explicit confirmation naming how many existing entries will be overwritten before any overwrite occurs.

#### Scenario: Multi-year backfill
- **WHEN** the user range-fills £2,000/mo from 2024-01 to 2026-10
- **THEN** all 34 months in the range are recorded at £2,000, with a confirmation shown before any existing entries are overwritten

#### Scenario: Range validation
- **WHEN** the user submits a range where "from" is after "to", or exceeds 120 months, or the amount is negative
- **THEN** the action fails with a validation error and no rows are written

### Requirement: Latest known monthly expenses are resolvable
The system SHALL resolve the latest known monthly expenses as the most recent record whose month is not after the current month; a £0 record SHALL be a valid latest value, and absence of any qualifying record SHALL resolve to unknown (null).

#### Scenario: Latest month wins
- **WHEN** records exist for 2026-08 and 2026-10 and the current month is 2026-10
- **THEN** the latest known monthly expenses is the 2026-10 amount

#### Scenario: Future months ignored
- **WHEN** the only records are for months after the current month
- **THEN** the latest known monthly expenses resolves to unknown

### Requirement: Legacy single-value expenses are migrated once
The system SHALL migrate the legacy global `system_metadata` `monthly_expenses` value into the new history table for the current month for every existing user, idempotently, and the legacy key SHALL be preserved (unread) for rollback.

#### Scenario: Backfill run
- **WHEN** the migration script runs with a legacy value of £2,000 present
- **THEN** each existing user receives a current-month record of 200000 pence, and re-running the script does not duplicate rows

#### Scenario: No legacy value
- **WHEN** the migration script runs with no `monthly_expenses` key
- **THEN** no records are written and the script reports a clean no-op

### Requirement: Settings surfaces latest known value with link to history
The settings general page SHALL display the latest known monthly expenses (with its month) instead of an editable single-value form, and link to `/overview/expenses` for editing.

#### Scenario: Settings summary
- **WHEN** the user opens settings/general and a latest known value exists
- **THEN** the page shows the amount and its month with a link to the expenses history page

#### Scenario: No history yet
- **WHEN** no expenses history exists for the user
- **THEN** the settings section indicates the value is unknown and links to the expenses history page

### Requirement: Expenses records are user-scoped
Expenses history SHALL be scoped to the owning user via the user filter on all queries and actions.

#### Scenario: Cross-user access rejected
- **WHEN** a request targets another user's expenses records
- **THEN** the action fails closed

