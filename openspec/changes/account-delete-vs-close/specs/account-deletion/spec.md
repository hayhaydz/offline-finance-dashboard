## ADDED Requirements

### Requirement: Accounts with zero transactions can be hard-deleted, distinct from closing
The system SHALL support a destructive account deletion, separate from closing, that is available only when the account has zero transactions; the delete removes the account row and its notes and rate history in a single atomic operation after explicit confirmation.

#### Scenario: Delete a mistaken empty account
- **WHEN** the user confirms deletion of an account with zero transactions
- **THEN** the account, its notes, and its rate history are removed and it no longer appears anywhere in the app

#### Scenario: Accounts with history cannot be deleted
- **WHEN** the user attempts deletion of an account with one or more transactions
- **THEN** deletion is refused server-side with guidance to close the account instead, and nothing is deleted

#### Scenario: Cross-user deletion rejected
- **WHEN** a request targets another user's account
- **THEN** the action fails closed via user access validation

### Requirement: Deletion disclosure precedes confirmation
The delete confirmation page SHALL disclose what will be removed (account name, note count, rate-history presence) before the user confirms, and the delete affordance SHALL NOT be offered for accounts with transaction history.

#### Scenario: Typed disclosure
- **WHEN** the confirmation page renders for an empty account
- **THEN** it lists the account name and what is removed, and requires explicit confirmation

#### Scenario: Affordance hidden for accounts with history
- **WHEN** an account detail page renders for an account with transactions
- **THEN** no delete affordance is shown; close guidance is available instead
