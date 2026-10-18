## ADDED Requirements

### Requirement: TTZ display distinguishes pays-off-this-month from never-pays-off
Liability TTZ displays SHALL treat `months === 0` as "pays off this month" and only render a never-pays-off state when `months === null`.

#### Scenario: Debt clearing this month
- **WHEN** a liability account has `ttz.months === 0`
- **THEN** the liabilities list and debt projection section display "pays off this month" and never display "Never pays off"

#### Scenario: Genuine never-pays-off
- **WHEN** a liability account has `ttz.months === null`
- **THEN** the never-pays-off state is displayed with its reason per the requirement below

### Requirement: Null projection renders a machine-identifiable reason
When a debt projection cannot be computed, the server SHALL provide `projectionNullReason` as one of `no_minimum_payment` or `payment_below_interest`, and the UI SHALL render it distinctly.

#### Scenario: No minimum payment rule configured
- **WHEN** a liability account has no minimum payment rule set and `ttz.months === null`
- **THEN** the UI renders "No minimum payment set" with a link to the account's edit page, in amber

#### Scenario: Payment below accruing interest
- **WHEN** the minimum payment is set but does not exceed monthly interest (`ttz.months === null`)
- **THEN** the UI renders "Payment below interest — CRITICAL" in `text-red-700`, consistent with the CRITICAL status badge
