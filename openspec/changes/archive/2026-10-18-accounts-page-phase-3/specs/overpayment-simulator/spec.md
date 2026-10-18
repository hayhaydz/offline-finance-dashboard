## ADDED Requirements

### Requirement: Inline overpayment simulator is available on debt accounts
The debt projection section SHALL include a payment input field that recalculates TTZ and total interest in real-time as the user adjusts the payment amount, entirely client-side.

#### Scenario: Simulator renders for liability accounts with projection data
- **WHEN** the account category is `"liability"` and `data.ttz.months` is non-null
- **THEN** a payment input field is rendered showing the current minimum payment as the default value

#### Scenario: Input is bounded by minimum payment and current balance
- **WHEN** the simulator input is rendered
- **THEN** the minimum accepted value is the effective minimum payment and the maximum accepted value is the current account balance (both in £, derived from pence)

#### Scenario: TTZ and interest recalculate as user types
- **WHEN** the user changes the payment input value
- **THEN** after a ~200ms debounce, `calculateTTZ()` is called client-side with the new payment amount and the results update immediately without a page reload

#### Scenario: Savings diff is shown when payment exceeds minimum
- **WHEN** the simulated payment is greater than the minimum payment
- **THEN** the display shows a diff line: `Saves X months and £Y in interest` compared to the minimum payment baseline

#### Scenario: Savings diff is hidden at minimum payment
- **WHEN** the simulated payment equals the minimum payment
- **THEN** no diff line is shown

#### Scenario: Simulator does not render for CRITICAL accounts
- **WHEN** `ttz.months === null` (debt never pays off at current payment)
- **THEN** the simulator input is NOT rendered (the CRITICAL badge communicates the situation)

#### Scenario: Simulator result shows debt-free date
- **WHEN** the simulator has a valid TTZ result
- **THEN** the debt-free month and year (e.g. `Nov 2026`) is displayed alongside TTZ months and total interest
