## MODIFIED Requirements

### Requirement: Cumulative interest column is shown in the projection table
The expanded month-by-month projection table SHALL include a running cumulative interest column showing the total interest accrued from month 1 to the current row, and SHALL annotate the break-even row when `originalPrincipal` is known.

#### Scenario: Cumulative interest column shown when table is expanded
- **WHEN** the projection table is in its expanded state
- **THEN** each row includes a cumulative interest total column, derived as the running sum of `interest` values from row 1 to the current row

#### Scenario: Cumulative total increases monotonically
- **WHEN** the cumulative interest column is rendered
- **THEN** each row's cumulative value is greater than or equal to the previous row's value

#### Scenario: Break-even row is annotated when originalPrincipal is known
- **WHEN** `breakEvenMonthIndex` is non-null and the projection table row index matches `breakEvenMonthIndex`
- **THEN** that row is visually annotated with a break-even crossover marker (see `break-even-month` spec)
