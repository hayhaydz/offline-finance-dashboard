### Requirement: Budget config is retroactively editable with an automatic amendment trail
The system SHALL allow editing any month's budget configuration (targets, included/excluded categories, accounts, and types) after the month has passed, and SHALL record every configuration change automatically as an amendment (field, old value, new value, timestamp, optional note — no reason is ever required). Configuration edits SHALL never modify transactions.

#### Scenario: Correcting a past month's target
- **WHEN** the user changes a past month's food target from £300 to £350
- **THEN** the new target applies to that month's calculations and an amendment records `food: £300 → £350` with the timestamp

#### Scenario: Optional note
- **WHEN** the user saves a retroactive edit
- **THEN** a free-text note may be attached but is never required

#### Scenario: Transactions are immutable
- **WHEN** any budget configuration change is made for any month
- **THEN** no transaction row is created, modified, or deleted

### Requirement: Config edits can apply forward without touching history
Configuration edits SHALL offer an "apply from this month onward" option that writes the change to the current and all future month rows, with each write trailed individually; "this month only" is the default.

#### Scenario: Forward-apply a target change
- **WHEN** the user raises the food target with forward-apply selected and 4 future month rows exist
- **THEN** all 5 rows are updated and 5 amendments are recorded; past months are untouched

### Requirement: Amendments are visible on the month page and the year timeline
Each month page SHALL show inline amended-value markers (`[amended <date> — was X]`) next to changed config values with an expandable full amendment list, and the budgets index SHALL show a year-level amendment timeline listing amendments across months in reverse-chronological order.

#### Scenario: Inline marker
- **WHEN** a month page renders a category target that has been amended
- **THEN** the current value shows with an amendment marker naming the date and previous value

#### Scenario: Year timeline
- **WHEN** the budgets index renders a year containing amendments across multiple months
- **THEN** an amendment timeline lists them latest-first, each identifying the month, field, and change
