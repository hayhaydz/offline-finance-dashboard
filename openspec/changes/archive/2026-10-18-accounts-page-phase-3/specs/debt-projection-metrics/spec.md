## MODIFIED Requirements

### Requirement: Overpayment scenario comparison is displayed in the debt projection summary
The debt projection section SHALL display a compact scenario comparison table showing minimum, +25%, and +50% payment options — **unless** the inline overpayment simulator (Phase 3.1) is also present, in which case the scenario table SHALL be omitted in favour of the simulator.

#### Scenario: Scenario table shown when simulator is not present
- **WHEN** `data.overpaymentScenarios` is set and the overpayment simulator is not rendered
- **THEN** the three-column scenario table (Minimum / +25% / +50%) is rendered below the debt projection summary metrics

#### Scenario: Scenario table omitted when simulator is present
- **WHEN** the inline overpayment simulator is rendered on the page
- **THEN** `data.overpaymentScenarios` table is NOT rendered (simulator supersedes it)

#### Scenario: Scenario table not shown for CRITICAL accounts
- **WHEN** `ttz.months === null`
- **THEN** `overpaymentScenarios` is not computed server-side and the table is not rendered
