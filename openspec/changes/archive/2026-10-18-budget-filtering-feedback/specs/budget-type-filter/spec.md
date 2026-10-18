## ADDED Requirements

### Requirement: Budgets can exclude transaction types
A budget month SHALL support an excluded-transaction-types list; excluded types are omitted from that budget's spending totals and category breakdowns, using the taxonomy's spending-rules definition for what counts as spending in the first place.

#### Scenario: Type excluded from budget
- **WHEN** a budget excludes `refund` and the month contains refunds
- **THEN** refunds no longer net against that budget's spending and the exclusion is visible in the filter panel

#### Scenario: Exclusions apply consistently
- **WHEN** budget totals, category breakdowns, and target progress are computed for a month with exclusions
- **THEN** all three apply the same type exclusions

### Requirement: New budgets are scoped to chosen accounts
Budget creation SHALL include an account scoping step (multi-select or explicit "all accounts"), and the chosen scope SHALL be editable afterwards via the existing account include/exclude panel.

#### Scenario: Scoped budget only tracks its accounts
- **WHEN** a budget is scoped to accounts A and B
- **THEN** transactions on account C never appear in that budget's breakdowns

#### Scenario: Default for new budgets is explicit
- **WHEN** the scoping step renders
- **THEN** "all accounts" is an explicit choice rather than a silent default
