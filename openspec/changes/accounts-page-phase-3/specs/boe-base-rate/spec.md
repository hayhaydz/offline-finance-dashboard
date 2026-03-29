## ADDED Requirements

### Requirement: BoE base rate is stored in app settings
The application SHALL have a `settings` key-value table that persists the Bank of England base rate as an integer in basis points under the key `"boeBaseRate"`.

#### Scenario: Base rate stored as basis points
- **WHEN** the BoE base rate is 4.50%
- **THEN** it is stored as `450` (integer, basis points) in `settings` where `key = "boeBaseRate"`

#### Scenario: Rate absent when not yet configured
- **WHEN** no `"boeBaseRate"` row exists in `settings`
- **THEN** the rate is treated as not configured and no spread line is rendered on any account

### Requirement: Interest spread relative to BoE base rate is shown on interest-bearing accounts
The account header SHALL display the account's interest rate spread relative to the BoE base rate when the base rate is configured.

#### Scenario: Spread shown for liability account above base rate
- **WHEN** the account is a liability with `interestRate > boeBaseRate` and the base rate is configured
- **THEN** the header shows `Rate: X.XX% (BoE base: Y.YY% · Your spread: +Z.ZZ%)` with the spread in `text-red-700` (above-market debt is bad)

#### Scenario: Spread shown for asset account below base rate
- **WHEN** the account is an asset with `interestRate < boeBaseRate` and the base rate is configured
- **THEN** the header shows `Rate: X.XX% (BoE base: Y.YY% · Your spread: -Z.ZZ%)` with the spread in `text-amber-700` (below-market savings is suboptimal)

#### Scenario: Spread shown neutral/green for asset at or above base rate
- **WHEN** the account is an asset with `interestRate >= boeBaseRate` and the base rate is configured
- **THEN** the spread is rendered in `text-green-700`

#### Scenario: Spread line hidden when base rate not configured
- **WHEN** no `"boeBaseRate"` setting exists
- **THEN** no spread line is rendered on any account page

#### Scenario: Spread line hidden when account has no interest rate
- **WHEN** `account.interestRate` is null or zero
- **THEN** no spread line is rendered
