## MODIFIED Requirements

### Requirement: Daily interest velocity is displayed in the debt projection summary
The debt projection section SHALL display the daily interest accrual figure alongside the monthly interest figure. This reframes cost as continuous rather than periodic.

#### Scenario: Daily rate shown for liability account with projection data
- **WHEN** a liability account has a projection with at least one month
- **THEN** the daily interest figure is shown as `£X.XX/day` adjacent to the monthly interest amount (derived as `projection[0].interest / 30.44`, formatted to 2 decimal places)

#### Scenario: Daily rate uses amber colour
- **WHEN** the daily interest figure is displayed
- **THEN** it uses `text-amber-700` consistent with other interest cost indicators

---

### Requirement: Payment efficiency metric is displayed in the debt projection summary
The debt projection section SHALL display a breakdown of each monthly payment showing what proportion services interest versus reduces principal.

#### Scenario: Efficiency metric shown when projection data exists
- **WHEN** a liability account has projection data for month 1
- **THEN** the page shows the interest amount, its percentage of the total payment, and the principal portion

#### Scenario: Interest portion rendered in amber, principal in green
- **WHEN** the payment efficiency metric is displayed
- **THEN** the interest value and percentage use `text-amber-700` and the principal value uses `text-green-700`

---

### Requirement: Minimum payment trap warning is shown for long-term debt
The debt projection section SHALL display a prominent warning when the current payment schedule takes more than 10 years (120 months) to clear the debt.

#### Scenario: Warning shown when TTZ exceeds 120 months
- **WHEN** `ttz.months > 120`
- **THEN** a warning block is displayed stating the number of years to pay off and the total interest cost, styled with `text-red-700`

#### Scenario: Warning not shown for CRITICAL accounts
- **WHEN** `ttz.months === null` (debt never pays off — CRITICAL status)
- **THEN** the minimum payment trap warning is NOT rendered (the CRITICAL badge already communicates this)

#### Scenario: Warning not shown for short-term debt
- **WHEN** `ttz.months <= 120`
- **THEN** the minimum payment trap warning is NOT rendered

---

### Requirement: Cumulative interest column is shown in the projection table
The expanded month-by-month projection table SHALL include a running cumulative interest column showing the total interest accrued from month 1 to the current row.

#### Scenario: Cumulative interest column shown when table is expanded
- **WHEN** the projection table is in its expanded state
- **THEN** each row includes a cumulative interest total column, derived as the running sum of `interest` values from row 1 to the current row

#### Scenario: Cumulative total increases monotonically
- **WHEN** the cumulative interest column is rendered
- **THEN** each row's cumulative value is greater than or equal to the previous row's value

---

### Requirement: Interest-to-principal lifetime ratio is displayed in the debt projection summary
The debt projection section SHALL display the proportion of total lifetime repayment cost that is pure interest, contextualising the true cost of the debt.

#### Scenario: Ratio shown when total interest is calculable
- **WHEN** `ttz.totalInterest` is non-null (i.e. account is HEALTHY or WARNING status)
- **THEN** the page displays the interest amount, total repayment cost (`currentBalance + totalInterest`), and interest as a percentage of total repayment

#### Scenario: Ratio hidden for CRITICAL accounts
- **WHEN** `ttz.totalInterest === null` (debt never pays off)
- **THEN** the interest:principal ratio is NOT rendered

#### Scenario: High interest ratio uses amber colour
- **WHEN** the interest percentage exceeds 30%
- **THEN** the ratio is displayed with `text-amber-700`

---

### Requirement: Overpayment scenario comparison table is available in the debt projection section
The debt projection section SHALL display a pre-computed three-column table comparing minimum, +25%, and +50% payment scenarios. This requirement extends the existing debt projection data structure to include server-computed scenario results alongside the standard projection and TTZ data.

#### Scenario: Scenario data is included in page load for liability accounts
- **WHEN** the page server loads data for a liability account with a non-null TTZ
- **THEN** `data.overpaymentScenarios` is populated with three entries computed via `calculateTTZ()` for each payment amount

#### Scenario: Scenario data absent for non-liability accounts
- **WHEN** the page server loads data for a non-liability account
- **THEN** `data.overpaymentScenarios` is null or undefined
