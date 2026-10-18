### Requirement: The finder computes per-tax-year threshold verdicts from known income and app interest
For each tax year, the band finder SHALL sum known income months plus the year's **non-tax-wrappered (taxable) interest** computed from the app's own data, compare against the per-tax-year thresholds (defaulting to HMRC values), and render a verdict with the arithmetic visible.

#### Scenario: Verdict with visible breakdown
- **WHEN** the finder renders a tax year
- **THEN** it shows known-month total, projected or missing-month treatment, auto-computed taxable interest, the threshold used, and the resulting margin (over/under by £X)

#### Scenario: ISA interest excluded
- **WHEN** a year's interest includes ISA and non-ISA interest
- **THEN** only non-ISA (taxable) interest counts toward the threshold comparison

### Requirement: Verdict states handle partial history honestly
Each year's verdict SHALL be classified: **FIRM** (all 12 months known, year complete), **EXPECTED** (future months projected at the last known month's rate, assumption shown and editable), **BOUNDED** (past months missing — never invented; the finder reverse-computes the average the missing months would need to cross the threshold, or states "over regardless of missing months" when known income alone exceeds it), or **UNKNOWN** (no data).

#### Scenario: Bounded verdict with missing past months
- **WHEN** a completed year has 9 known months totalling £41,300 against a £50,270 threshold with 3 months missing
- **THEN** the finder reports the missing months need ≥ £2,990/month average to reach the threshold, without inventing values

#### Scenario: Over regardless of gaps
- **WHEN** known months alone already exceed the threshold for a year with missing months
- **THEN** the verdict states the band threshold is crossed regardless of the missing months

#### Scenario: Expected verdict labels its assumption
- **WHEN** the current year projects future months at the last known month's income
- **THEN** the verdict is labelled with the projection assumption and the assumption is editable

### Requirement: Verdicts apply to band history only on explicit action
The finder SHALL offer one-click application of a suggested band to the band history, and SHALL never write band rows automatically.

#### Scenario: Apply a verdict
- **WHEN** the user clicks apply on a FIRM HIGHER verdict for 2026/27
- **THEN** a band history row (higher, from 2026/27) is created with confirmation feedback

#### Scenario: No automatic mutation
- **WHEN** income data changes such that a previously-applied band's verdict would differ
- **THEN** no band row changes without an explicit user action
