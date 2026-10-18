## ADDED Requirements

### Requirement: Rate change stress test rows are shown in the debt projection section
The debt projection section SHALL display two pre-computed scenario rows showing the impact on TTZ and total interest if the account's interest rate rises by 200bp (+2%) or 500bp (+5%).

#### Scenario: Stress test rows shown for liable accounts with projection data
- **WHEN** the account category is `"liability"` and `data.ttz.months` is non-null
- **THEN** two scenario rows are rendered: one at current rate +200bp and one at current rate +500bp

#### Scenario: Each row shows rate, TTZ delta, interest delta, and debt-free date
- **WHEN** a rate scenario row is rendered
- **THEN** it displays the scenario rate (e.g. `22.00%`), the TTZ in months, the total interest cost, and the projected debt-free month/year

#### Scenario: TTZ delta is shown relative to current scenario
- **WHEN** the stressed TTZ is greater than the current TTZ
- **THEN** a delta annotation is shown (e.g. `+3 months`) in `text-amber-700`

#### Scenario: Capped display for extreme TTZ values
- **WHEN** a stress scenario TTZ exceeds 300 months
- **THEN** the TTZ is displayed as `300+ months` rather than the exact figure

#### Scenario: Stress test rows not shown for CRITICAL accounts
- **WHEN** `ttz.months === null` (debt never pays off at current payment)
- **THEN** the rate stress test section is NOT rendered

#### Scenario: Stress test rows not shown for non-liability accounts
- **WHEN** the account category is not `"liability"`
- **THEN** the rate stress test section is NOT rendered
