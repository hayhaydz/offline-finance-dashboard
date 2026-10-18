## ADDED Requirements

### Requirement: Goal name and target can be edited after creation
The system SHALL allow editing a goal's name and target amount after creation via an authenticated action on the goal detail page.

#### Scenario: Edit target successfully
- **WHEN** the user submits a new target amount greater than or equal to the current allocation
- **THEN** the goal's target is updated, progress percentage recomputes, and a success confirmation is shown

#### Scenario: Target below current allocation is rejected
- **WHEN** the user submits a target amount below the goal's current allocation
- **THEN** the edit is rejected with "Target below current allocation £X" and no change is written

#### Scenario: Cross-user edit rejected
- **WHEN** a request targets a goal belonging to another user
- **THEN** the action fails closed via user access validation

### Requirement: Over-adding past target is allowed and clearly displayed
The system SHALL permit allocations beyond 100% of target (intended behaviour — continued saving past an original goal), and the UI SHALL communicate the over-target state explicitly.

#### Scenario: Allocation exceeds target
- **WHEN** a goal's current allocation exceeds its target amount
- **THEN** the goal detail and list views display a "REACHED — £X over target" state in green instead of a raw percentage above 100

#### Scenario: Add flow beyond target completes normally
- **WHEN** the user adds money that takes allocation past the target
- **THEN** the allocation succeeds with no rejection or clamping
