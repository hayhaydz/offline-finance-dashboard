## ADDED Requirements

### Requirement: Every budgets-page form renders feedback
All budgets-page forms (include/exclude category, include/exclude account, set target, edit target, month configuration) SHALL render explicit validation errors on failure and success confirmation on completion; a failed submission SHALL never be visually identical to a successful one.

#### Scenario: Failed include-toggle
- **WHEN** a category include/exclude submission fails server-side
- **THEN** an error message renders near the filter panel and the toggle state does not silently change

#### Scenario: Successful target save
- **WHEN** a category target is saved
- **THEN** a success confirmation renders and the updated total reflects it

### Requirement: Budget forms surface validation before submission where possible
Client-side validation SHALL catch empty/invalid amounts and empty selections before submission, matching server-side rules.

#### Scenario: Invalid target amount
- **WHEN** the user enters a non-numeric target amount
- **THEN** the form shows a field-level error without submitting
