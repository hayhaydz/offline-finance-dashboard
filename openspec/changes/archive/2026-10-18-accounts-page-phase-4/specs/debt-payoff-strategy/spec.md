## ADDED Requirements

### Requirement: A payoff strategy tip is shown on debt accounts when multiple liabilities exist
The debt projection section SHALL display a one-line contextual tip indicating whether the current account is the avalanche priority (highest interest rate) or snowball priority (lowest balance) across the user's liability accounts.

#### Scenario: Tip shown when user has more than one liability account
- **WHEN** the account category is `"liability"` and the user has 2 or more liability accounts
- **THEN** a one-line tip is rendered in the debt projection section

#### Scenario: Avalanche priority tip shown when current account has the highest rate
- **WHEN** the current account's interest rate is the highest among all user liability accounts
- **THEN** the tip reads: `[TIP] Pay this account first — highest rate across your N debts (avalanche method)`

#### Scenario: Snowball priority tip shown when current account has the lowest balance
- **WHEN** the current account's current balance is the lowest among all user liability accounts (and it is not already the avalanche priority)
- **THEN** the tip reads: `[TIP] Pay this account first — smallest balance across your N debts (snowball method)`

#### Scenario: Neither tip shown when current account is not a priority by either method
- **WHEN** the current account is neither the highest rate nor the lowest balance across user liabilities
- **THEN** no payoff strategy tip is rendered

#### Scenario: Tip not shown when user has only one liability account
- **WHEN** the user has exactly one liability account
- **THEN** no payoff strategy tip is rendered

#### Scenario: Cross-account query is filtered by user
- **WHEN** loading liability accounts for strategy comparison
- **THEN** only accounts belonging to the current authenticated user are included in the comparison
