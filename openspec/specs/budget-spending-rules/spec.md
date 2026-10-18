### Requirement: Budget spending has an explicit documented definition
Budget spending SHALL be defined as `withdrawal` + `charge` − `refund` transaction amounts, excluding transfers between owned accounts and liability repayments (`payment`), and this definition SHALL be enforced identically in every budget query and displayed in the budget UI.

#### Scenario: Refund reduces category spending
- **WHEN** a budget month contains a £50 `withdrawal` and a £20 `refund` in the same category
- **THEN** that category's budget spending shows £30

#### Scenario: Liability payment is not spending
- **WHEN** a `payment` (liability repayment) transaction exists in a budget month
- **THEN** it does not appear in any budget spending total or category breakdown

#### Scenario: Spending definition is visible to the user
- **WHEN** the budget page renders
- **THEN** the spending definition (which types count, which are excluded) is discoverable in the UI (e.g. filter panel footnote)

#### Scenario: All budget queries agree
- **WHEN** budget month totals, category breakdowns, and target tracking are computed
- **THEN** all use the same type-based spending definition with no per-query divergence
