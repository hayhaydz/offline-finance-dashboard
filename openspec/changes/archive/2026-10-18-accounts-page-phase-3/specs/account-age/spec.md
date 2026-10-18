## ADDED Requirements

### Requirement: Account age is displayed in the account header
The account header SHALL display the real-world account opening date and the derived age (years and months) when the `openedAt` field is set.

#### Scenario: Age shown when openedAt is set
- **WHEN** `account.openedAt` is a non-null timestamp
- **THEN** the header shows `Opened: <Mon YYYY> · Age: <Xy Zm>` (e.g. `Opened: Mar 2023 · Age: 3y 0m`)

#### Scenario: Age section hidden when openedAt is null
- **WHEN** `account.openedAt` is null
- **THEN** no "Opened" line is rendered in the header

#### Scenario: openedAt is editable in the account edit form
- **WHEN** the user visits the account edit page
- **THEN** an optional date input field for "Opened date" is available and updates `openedAt` on save

### Requirement: openedAt schema field exists on accounts
The accounts table SHALL have a nullable `openedAt` timestamp column representing the real-world date the account was opened (distinct from `createdAt`).

#### Scenario: openedAt is nullable
- **WHEN** a new account is created without an opening date
- **THEN** `openedAt` is stored as `NULL` with no validation error

#### Scenario: openedAt can be set independently of createdAt
- **WHEN** a user sets an opening date of 5 years ago
- **THEN** `openedAt` stores that historical date while `createdAt` retains the dashboard entry date
