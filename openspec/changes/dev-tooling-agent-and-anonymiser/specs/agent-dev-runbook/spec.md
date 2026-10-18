## ADDED Requirements

### Requirement: A documented repeatable agent development loop exists
The repository SHALL include a developer/agent runbook (`docs/dev/agent-runbook.md`) covering environment boot modes, scratch reset, guardrails (locked files, no git, no prod paths), verification commands, and the findings-notes convention, such that a fresh agent session can start work without ad-hoc knowledge.

#### Scenario: Fresh agent session
- **WHEN** an agent follows the runbook from a clean checkout
- **THEN** it can boot the dev environment, reset scratch data, learn the guardrails, and know where to file findings without asking

### Requirement: Scratch environment resets in one command
A single command SHALL reset the scratch dev database to the standard seed state, and SHALL refuse to operate on encrypted/prod database paths.

#### Scenario: Scratch reset
- **WHEN** the reset command runs
- **THEN** the scratch DB is restored to standard seed data

#### Scenario: Prod refusal
- **WHEN** the reset command detects prod or encrypted-DB involvement
- **THEN** it aborts with an explanatory error and changes nothing
