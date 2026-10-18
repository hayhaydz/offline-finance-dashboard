## ADDED Requirements

### Requirement: Actionable alerts carry deep links
Every computed alert type with a natural resolution destination SHALL set a deep link using slug-based URLs (no numeric IDs), and the alerts surfaces (`/alerts`, inline account alerts) SHALL render it as a navigable control.

#### Scenario: Unmatched transfer alert links to the ledger
- **WHEN** an unmatched-transfer alert renders
- **THEN** it links to the affected account's ledger, prefILTERED to the alert's transfer type and month

#### Scenario: Budget alert links to the budget month
- **WHEN** a budget-threshold alert renders
- **THEN** it links to the corresponding budget month page

#### Scenario: Linkless alerts are deliberate
- **WHEN** an alert type has no actionable destination (e.g. informational market notes)
- **THEN** it renders without a link, and this is documented per type in an alert-type link table

### Requirement: Deep links land on meaningful prefILTERED views
Alert deep links SHALL land on views prefiltered to the alert's subject, and the prefilter SHALL be visibly indicated and clearable.

#### Scenario: Prefilter chip
- **WHEN** the ledger opens with a `type` prefilter from an alert link
- **THEN** a visible `[Type: transfer_in] [Clear]` chip renders and clearing it restores the full month view
