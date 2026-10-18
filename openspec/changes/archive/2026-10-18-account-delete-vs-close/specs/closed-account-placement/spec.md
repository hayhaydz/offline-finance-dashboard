## ADDED Requirements

### Requirement: Closed accounts sort below open accounts behind a toggle
The accounts index SHALL display closed accounts after open accounts within each type section, collapsed behind a `[Show N closed]` toggle, and this placement SHALL NOT exclude closed accounts from historical interest, ISA, or tax-year breakdowns.

#### Scenario: Placement
- **WHEN** a type section contains 3 open and 2 closed accounts
- **THEN** the 3 open accounts render first and a collapsed toggle row reads `[Show 2 closed]`

#### Scenario: History integrity
- **WHEN** a closed account has interest transactions in a past tax year
- **THEN** that year's interest and tax breakdowns still include them despite the account being closed

#### Scenario: Toggle state persists
- **WHEN** the user expands the closed toggle and navigates away and back
- **THEN** the expansion state is remembered

### Requirement: Close-account failures are visible
Close-account operations SHALL render success or failure feedback; a failed close is never indistinguishable from a successful one (folds in audit backlog #10).

#### Scenario: Failed close
- **WHEN** a close-account submission fails
- **THEN** an error message renders on the page and the account remains open
