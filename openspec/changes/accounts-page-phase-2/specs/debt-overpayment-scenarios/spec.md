## ADDED Requirements

### Requirement: Debt projection section displays an overpayment scenario comparison table
For liability accounts, the debt projection section SHALL display a compact three-column table comparing outcomes for the current minimum payment, a +25% payment, and a +50% payment. Each column shows the payment amount, time to zero (TTZ), total interest cost, and projected debt-free date. The scenarios are pre-computed server-side.

#### Scenario: Scenario table shown for liability account with valid TTZ
- **WHEN** a liability account has a non-null `ttz.months` (debt will eventually pay off)
- **THEN** the scenario comparison table is rendered with three columns: Minimum, +25%, +50%

#### Scenario: Scenario table hidden for CRITICAL accounts
- **WHEN** `ttz.months === null` (debt never pays off at current payment)
- **THEN** the scenario comparison table is NOT shown

#### Scenario: Payment amount row
- **WHEN** the scenario table is rendered
- **THEN** the Payment row shows the monthly payment for each scenario in £ format (pence ÷ 100)

#### Scenario: TTZ row
- **WHEN** the scenario table is rendered
- **THEN** the TTZ row shows the number of months to clear the debt for each scenario (e.g. `14m`)

#### Scenario: Total interest row
- **WHEN** the scenario table is rendered
- **THEN** the Total Interest row shows total interest paid over the repayment period for each scenario, in £ format

#### Scenario: Debt-free date row
- **WHEN** the scenario table is rendered
- **THEN** the Debt-free row shows the projected month and year the debt is cleared for each scenario (e.g. `May 2027`)

#### Scenario: Higher payments show better outcomes
- **WHEN** the +25% and +50% scenarios are displayed
- **THEN** their TTZ and total interest values SHALL be less than or equal to the minimum scenario values

#### Scenario: Scenario computation uses calculateTTZ
- **WHEN** scenarios are computed in the page server
- **THEN** `calculateTTZ()` is called with the current balance, rate, and each of the three payment amounts to derive independent results
