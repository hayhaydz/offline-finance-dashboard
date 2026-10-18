### Requirement: Tax bands are recorded with UK-tax-year date ranges
The system SHALL store tax band history as rows scoped to the user with a band (`basic`, `higher`, `additional`) and a UK-tax-year range (`fromTaxYear`, optional `toTaxYear`), rejecting overlapping ranges for the same user.

#### Scenario: Overlap rejected
- **WHEN** the user adds a band whose range overlaps an existing band
- **THEN** the add is rejected with an error naming the conflicting range, and no row is written

#### Scenario: Backfill default
- **WHEN** the migration runs for an existing user with band `higher`
- **THEN** a single history row exists (`higher`, from the current tax year, open-ended)

### Requirement: Tax calculations resolve the band for the relevant tax year
All tax-band-dependent calculations (interest tax position, PSA, snapshot tax position, ISA projections) SHALL resolve the band via the effective band for the tax year being computed, never a hardcoded or "current-only" band.

#### Scenario: Past-year interest uses the past-year band
- **WHEN** a user's band was `higher` in 2025/26 and `basic` in 2026/27, and the 2025/26 interest year page is viewed
- **THEN** the personal savings allowance applied reflects the `higher` band (£500)

#### Scenario: Snapshot creation resolves per-year band
- **WHEN** a snapshot is created for a tax year
- **THEN** its stored tax position uses the resolver's band for that tax year, not a hardcoded `basic`

#### Scenario: Gap in history falls back deterministically
- **WHEN** a tax year has no covering row but an earlier row exists
- **THEN** the nearest earlier band applies and the UI indicates the assumption

### Requirement: Bands are tax-year-atomic and cannot be split within a year
Band history SHALL be keyed by whole UK tax years; a mid-year income change records as a band change from the tax year containing the change, applying to that entire tax year including months before the change. The tax section UI SHALL normalise mid-year date input to a tax-year boundary with an explanatory note.

#### Scenario: July salary change
- **WHEN** the user indicates a band change effective July 2026
- **THEN** the band row records "from 2026/27" and applies to the whole tax year, with UI copy explaining the year-atomic rule

### Requirement: The tax section exposes band history with form feedback
A dedicated tax content section (`/overview/tax`, a nav child of Overview) SHALL list the user's band history, allow adding/closing ranges, and render explicit success or validation feedback for every form submission. Settings SHALL NOT contain tax band management after this change.

#### Scenario: Form feedback
- **WHEN** a band change is submitted
- **THEN** the user sees either a success confirmation or a field-level error — never a silent reload

### Requirement: The interest page shows the resolved band per tax year
The interest year page SHALL display the band resolved for that tax year with its PSA amount; the current in-progress year SHALL be labelled "(expected)" until the year closes, and a year whose band differs from the previous year SHALL note that the band applies to the whole year (no pro-rata).

#### Scenario: Past year badge
- **WHEN** a complete past tax year renders
- **THEN** its header shows the resolved band and PSA (e.g. "2025/26 · BASIC · £1,000 PSA")

#### Scenario: Current year expectation framing
- **WHEN** the in-progress tax year renders
- **THEN** the band badge includes "(expected)" and, where the band changed from the prior year, a note that it applies to the whole tax year including interest earned before the change
