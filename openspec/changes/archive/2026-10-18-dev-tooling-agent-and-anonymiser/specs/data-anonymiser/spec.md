## ADDED Requirements

### Requirement: The anonymiser preserves bug-reproducing data shapes
`scripts/anonymise.ts` SHALL transform a database copy such that data shapes relevant to bugs are preserved: a constant per-run date offset in **whole months** (month grouping and intervals intact), proportional amount jitter within ±5% with sign preserved, and structure-preserving seeded renames of names/descriptions with slugs regenerated.

#### Scenario: Month-boundary bug reproduces after anonymisation
- **WHEN** the source DB has a month whose transaction count straddles a page boundary and the DB is anonymised
- **THEN** the output DB preserves the same month-boundary straddle shape (the whole-month offset shifts the calendar rigidly, never moving a transaction across a month edge)

#### Scenario: Amount jitter keeps sign and scale
- **WHEN** amounts are jittered
- **THEN** every amount stays within ±5% of its source, no amount changes sign, and zeros remain zero

#### Scenario: Deterministic output
- **WHEN** the anonymiser runs twice with the same source and `--seed`
- **THEN** the outputs are identical

### Requirement: The anonymiser never touches live data and fails loud on uncovered tables
The anonymiser SHALL operate only on an explicit source/out file pair, refuse paths that resolve to configured live databases, never log source values, and abort with an explicit error when it encounters a schema table with no transform rules.

#### Scenario: Live DB refusal
- **WHEN** the source path matches a configured live DB location
- **THEN** the run aborts before reading data

#### Scenario: Uncovered table aborts
- **WHEN** a schema table has no transform rules registered
- **THEN** the anonymiser aborts naming the table, rather than copying it untransformed

#### Scenario: Output integrity verified
- **WHEN** a run completes
- **THEN** the output DB passes an integrity self-check (tables present, foreign keys consistent) and a plausibility summary prints without identity strings
