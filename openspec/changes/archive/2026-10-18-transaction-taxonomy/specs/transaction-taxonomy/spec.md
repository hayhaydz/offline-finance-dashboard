## ADDED Requirements

### Requirement: Transaction type glossary is authoritative and single-sourced
The system SHALL maintain one authoritative glossary of transaction types in `docs/`, and every surface where types enter data (creator form, CSV import template/validation) SHALL use `TRANSACTION_TYPES` from `domain-constants.ts` as the single source of truth with per-type helper text.

#### Scenario: Creator form offers all applicable types
- **WHEN** the transaction creator renders for any account
- **THEN** its type options are generated from `TRANSACTION_TYPES` (with per-account-category filtering) rather than a hardcoded subset, and every option shows its glossary one-liner

#### Scenario: Importer and creator accept an identical type set
- **WHEN** a type is valid in the CSV importer
- **THEN** the same type is selectable in the transaction creator for a compatible account category

### Requirement: Refund is a first-class transaction type
The system SHALL support a `refund` transaction type representing the reversal of a prior external purchase, accepted by schema, creator, and CSV import.

#### Scenario: Refund recorded on a credit card
- **WHEN** the user records a card refund as `refund`
- **THEN** it reduces spending totals and is not treated as a market value change

#### Scenario: Historical value_change reclassification is opt-in
- **WHEN** the user opens the data utility listing candidate `value_change` refund-like rows
- **THEN** no rows change until the user confirms, and the utility reports how many rows were reclassified

### Requirement: Transfer and accrual types are excluded from cash and tax totals
`transfer_in`/`transfer_out` SHALL net to zero in net-worth and spending contexts, and `interest_accrued` SHALL be excluded from cash balances and paid-interest tax figures while `interest` is included.

#### Scenario: Accrued interest does not inflate taxable interest
- **WHEN** an account has both `interest` and `interest_accrued` rows in a tax year
- **THEN** only `interest` rows contribute to the interest breakdown's taxable/tax-free actuals

#### Scenario: Internal transfers do not affect spending
- **WHEN** a matched `transfer_out`/`transfer_in` pair exists between two owned accounts
- **THEN** neither row appears in spending totals or budget calculations
