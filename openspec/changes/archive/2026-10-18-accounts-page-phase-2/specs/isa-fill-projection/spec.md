## ADDED Requirements

### Requirement: ISA allowance widget projects when the ISA will be fully subscribed
For ISA, LISA, and Premium Bond accounts with an active allowance, the ISA allowance widget SHALL project the month in which the remaining allowance will be fully subscribed, based on the average monthly deposit cadence over the last 3 months.

#### Scenario: Active allowance with positive deposit cadence
- **WHEN** the account has remaining ISA allowance and the average monthly deposit over the last 3 months is greater than zero
- **THEN** the widget displays: `£X of £20,000 used · At £Y/month, you'll fill by <Month>`

#### Scenario: No recent deposits
- **WHEN** the average monthly deposit cadence over the last 3 months is zero
- **THEN** the widget displays: `£X of £20,000 used · No recent deposits` without a fill projection

#### Scenario: Allowance already full
- **WHEN** `isaSummary.allowanceRemaining === 0`
- **THEN** the widget displays: `Allowance full for this tax year` without any deposit cadence or projection

#### Scenario: Fill date beyond tax year end
- **WHEN** the projected fill date is after the current tax year end (5 April)
- **THEN** the widget displays the projection date AND shows the remaining months in the tax year: `At £Y/month, you'll fill by <Month> (tax year ends in X months)`

#### Scenario: Deposit cadence calculation
- **WHEN** calculating the average monthly deposit cadence
- **THEN** the system SHALL use the last 3 entries in `monthlyBalances`, taking only positive balance deltas (closing minus prior closing) and averaging them; negative deltas (withdrawals) SHALL be treated as zero for cadence purposes

#### Scenario: Fewer than 3 months of history
- **WHEN** fewer than 3 monthly balance entries exist
- **THEN** the cadence is calculated from however many months are available; if only 1 month is available, that single month's deposit is used as the cadence
