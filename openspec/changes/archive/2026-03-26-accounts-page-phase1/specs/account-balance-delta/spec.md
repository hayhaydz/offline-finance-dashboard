## ADDED Requirements

### Requirement: Balance delta strip is displayed in the account header
The account detail page SHALL display a one-line balance trajectory strip directly below the current balance in the account header. The strip shows the change in closing balance compared to one month ago and twelve months ago, using direction-aware framing based on account category.

#### Scenario: Asset account with sufficient history shows delta in green for growth
- **WHEN** an asset account (`category === 'asset'`) has at least 2 months of balance history
- **THEN** the strip shows `▲ £X from last month` with `text-green-700` when the balance has increased

#### Scenario: Asset account with sufficient history shows delta in red for decline
- **WHEN** an asset account has at least 2 months of balance history
- **THEN** the strip shows `▼ £X from last month` with `text-red-700` when the balance has decreased

#### Scenario: Liability account shows green for falling balance (debt repaid)
- **WHEN** a liability account (`category === 'liability'`) has at least 2 months of balance history and the closing balance has decreased
- **THEN** the strip shows `▼ £X repaid this month` with `text-green-700`

#### Scenario: Liability account shows red for rising balance (debt growing)
- **WHEN** a liability account has at least 2 months of balance history and the closing balance has increased
- **THEN** the strip shows `▲ £X from last month` with `text-red-700`

#### Scenario: 12-month delta shown when sufficient history exists
- **WHEN** an account has at least 12 months of balance history
- **THEN** the strip also shows the delta vs 12 months ago alongside the 1-month delta

#### Scenario: Missing period shows placeholder
- **WHEN** an account has fewer than 12 months of history but at least 2
- **THEN** the 12-month delta shows `—` rather than being omitted

#### Scenario: Strip hidden for new accounts
- **WHEN** an account has fewer than 2 months of balance history
- **THEN** the balance delta strip is not rendered
