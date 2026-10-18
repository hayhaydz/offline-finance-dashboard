### Requirement: Monthly gross income is recorded per month with unknown gaps
The system SHALL store one gross income record per user per month, managed from a dedicated income page under the tax section (`/overview/tax/income`) (`YYYY-MM`), where a present row means the month's income is known (including £0) and an absent row means unknown — never zero by default.

#### Scenario: Zero-income month is explicit
- **WHEN** the user records £0 for a month
- **THEN** that month is treated as known income of £0, distinct from a missing month

#### Scenario: Gaps are visible
- **WHEN** the income grid renders a year with missing months
- **THEN** missing months are visibly distinct from entered months (and from £0 months)

### Requirement: Range-fill backfills contiguous months at a fixed rate
The system SHALL provide a range-fill action ("£X per month from month A to month B") that writes the rate to every month in the range, with an explicit confirmation naming how many existing individual entries will be overwritten.

#### Scenario: Multi-year backfill
- **WHEN** the user range-fills £3,200/mo from 2023-04 to 2026-06
- **THEN** all 39 months in the range are recorded at £3,200, with a confirmation shown before any existing entries are overwritten

#### Scenario: Edits and deletes
- **WHEN** the user edits or removes a single month's entry
- **THEN** the change applies to that month only and feedback renders

### Requirement: Income records are user-scoped
Income history SHALL be scoped to the owning user via the user filter on all queries and actions.

#### Scenario: Cross-user access rejected
- **WHEN** a request targets another user's income records
- **THEN** the action fails closed
