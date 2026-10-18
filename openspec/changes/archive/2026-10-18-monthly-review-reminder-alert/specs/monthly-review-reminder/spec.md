## ADDED Requirements

### Requirement: Alert fires when no monthly review exists for current month
The system SHALL display an alert when the current calendar month has no corresponding monthly review record, with severity escalating based on days into the month.

#### Scenario: No review exists early in month
- **WHEN** the current date is between day 1 and 7 of the month
- **AND** no monthly review exists for the current year-month (YYYY-MM)
- **THEN** the system displays a `NO_MONTHLY_REVIEW` alert with severity `info`
- **AND** the message reads "No review yet for [Month Year]"
- **AND** the alert includes a link to `/reviews`

#### Scenario: No review exists mid-month
- **WHEN** the current date is between day 8 and 14 of the month
- **AND** no monthly review exists for the current year-month
- **THEN** the system displays a `NO_MONTHLY_REVIEW` alert with severity `amber`
- **AND** the message reads "Review overdue for [Month Year]"

#### Scenario: No review exists late in month
- **WHEN** the current date is day 15 or later in the month
- **AND** no monthly review exists for the current year-month
- **THEN** the system displays a `NO_MONTHLY_REVIEW` alert with severity `red`
- **AND** the message reads "Review urgently needed for [Month Year]"

#### Scenario: Review already exists
- **WHEN** a monthly review already exists for the current year-month
- **THEN** no `NO_MONTHLY_REVIEW` alert is displayed

### Requirement: Alert is global (not account-specific)
The system SHALL create the monthly review reminder as a global alert, not tied to any specific account.

#### Scenario: Alert structure
- **WHEN** the `NO_MONTHLY_REVIEW` alert is generated
- **THEN** the alert id is `NO_MONTHLY_REVIEW:global`
- **AND** no `accountSlug`, `accountName`, or `accountType` fields are present
- **AND** the `href` is `/reviews`
