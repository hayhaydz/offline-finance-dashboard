## ADDED Requirements

### Requirement: PSA consumption and breach projection is shown in the interest summary widget
For non-ISA savings and investment accounts, the interest summary widget SHALL display the amount of Personal Savings Allowance consumed and project whether the allowance will be breached before the end of the current tax year. The projection is suppressed when the PSA is less than 50% used and no breach is projected.

#### Scenario: PSA not yet exceeded — low usage, no risk
- **WHEN** `taxFreeStatus.used < 0.5 * allowanceThreshold` AND the projected year-end interest does not breach the allowance
- **THEN** the PSA projection line is NOT shown

#### Scenario: PSA approaching limit — show usage and projection
- **WHEN** `taxFreeStatus.used >= 0.5 * allowanceThreshold` AND the allowance has not yet been exceeded
- **THEN** the widget shows: `PSA: £X of £1,000 used · At current rates, you'll exceed by <Month>`

#### Scenario: PSA already exceeded
- **WHEN** `taxFreeStatus.overAllowance === true`
- **THEN** the widget shows: `PSA exceeded — £X taxable` where £X is the amount above the allowance, styled in `text-red-700`

#### Scenario: Breach month projection calculation
- **WHEN** projecting the month of PSA breach
- **THEN** the system SHALL divide `taxFreeStatus.remaining` by the estimated monthly interest rate and add the result to the current date to determine the projected breach month

#### Scenario: No breach projected despite high usage
- **WHEN** `taxFreeStatus.used >= 0.5 * allowanceThreshold` but projected year-end interest will not exhaust the remaining allowance
- **THEN** the widget shows: `PSA: £X of £1,000 used · On track to stay within limit`

#### Scenario: Widget not shown for ISA accounts
- **WHEN** the account is an ISA type
- **THEN** the PSA burn rate projection is NOT shown (ISA interest is always tax-free)
