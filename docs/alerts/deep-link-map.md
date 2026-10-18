# Alert deep-link map

Per-type audit of every computed alert type → `href` pattern (or deliberate none-why).
Convention: slug-based URLs only, no numeric IDs. Built as the task artefact for the
`alerts-deep-links` change (design decision 4); reviewed in-PR.

Patterns:

- `[slug]` = the alert's account slug; `[goal-slug]` = goal slug
- `[month]` = `YYYY-MM` UTC month key of the alert's subject
- `[ty]` = tax year slug (`2026-27`)

## Account-level alerts (sync checkers + async account checkers)

| Type | href | Notes |
|---|---|---|
| MATURITY_SOON_30 / _7 / _1 | `/accounts/[slug]` | Account ledger; maturity is account-level |
| MATURITY_PASSED_NO_RATE | `/accounts/[slug]` | Ledger + rates section is the fix destination |
| RATE_DECREASED_SAVINGS | `/accounts/[slug]` | Ledger + rates section |
| RATE_INCREASED_LIABILITY | `/accounts/[slug]` | Ledger + rates section |
| NO_RATE_SET | `/accounts/[slug]` | Ledger + rates section |
| STALE_BALANCE | `/accounts/[slug]` | Ledger |
| CREDIT_LIMIT_APPROACHING | `/accounts/[slug]` | Ledger |
| CREDIT_LIMIT_NEAR_MAX | `/accounts/[slug]` | Ledger |
| NO_LIABILITY_PAYMENT | `/accounts/[slug]?month=[month]` | Month with the missing payment (current UTC month) |
| INTEREST_ACCRUED_UNPOSTED | `/accounts/[slug]?type=interest_accrued&month=[month]` | Month of the last accrual, prefiltered |
| ZERO_BALANCE_ACTIVE | `/accounts/[slug]` | Ledger |
| PREMIUM_BONDS_OVER_LIMIT | `/accounts/[slug]` | Ledger |
| NO_DISBURSEMENT | `/accounts/[slug]` | Ledger (add the disbursement there) |
| UNUSED_ISA_ACCOUNT | `/accounts/[slug]` | Per-account: the ledger is where the deposit goes |
| CLOSED_WITH_BALANCE | `/accounts/[slug]` | Ledger |
| DEBT_NEVER_PAYS_OFF | `/accounts/[slug]` | Ledger + debt projection |
| SAVINGS_RATE_BELOW_BOE | `/accounts/[slug]` | Ledger + rates section |
| LISA_CONTRIBUTION_LIMIT | `/accounts/[slug]` | Per-account: this tax year's deposits live in its ledger |
| ORPHANED_TRANSFER | primary: `/accounts/[slug]?type=transfer_in&month=[month]`; secondary: `/accounts/[counterpart-slug]?type=transfer_out&month=[month]` | Primary = the `transfer_in` side; secondary counterpart link when a same-amount candidate account exists (≤2 links per alert) |

## Global alerts (user-level)

| Type | href | Notes |
|---|---|---|
| ISA_FULL | `/accounts/isa` | ISA report (redirects to current tax year) |
| ISA_NEARLY_FULL | `/accounts/isa` | ISA report |
| ISA_PACING_BEHIND | `/accounts/isa` | ISA report |
| PSA_EXCEEDED | `/accounts/interest/[ty]` | Current tax year interest report (where PSA is computed) |
| PSA_NEARLY_EXCEEDED | `/accounts/interest/[ty]` | Current tax year interest report |
| ADDITIONAL_RATE_PSA_ZERO | `/accounts/interest/[ty]` | Current tax year interest report |
| TAX_YEAR_INTEREST_REVIEW | `/accounts/interest/[prev-ty]` | Previous tax year report (existing) |
| TAX_YEAR_ISA_REVIEW | `/accounts/isa/[prev-ty]` | Previous tax year ISA report (existing) |
| NET_WORTH_DECLINING | `/overview/snapshots` | Snapshot history (existing) |
| NET_WORTH_SUSTAINED_DECLINE | `/overview/snapshots` | Snapshot history (existing) |
| NO_SNAPSHOT_RECENTLY | `/overview/snapshots` | Take a snapshot (existing) |
| NO_MONTHLY_REVIEW | `/overview/routine` | Monthly review page (was dead `/reviews` link — fixed in this change) |
| BUDGET_PROJECTED_OVERSPEND | `/overview/budgets/[month]` | Current month budget (existing) |
| BUDGET_OVERSPEND | `/overview/budgets/[month]` | Current month budget (existing) |
| CATEGORY_BUDGET_APPROACHING | `/overview/budgets/[month]` | Current month budget (existing) |
| CATEGORY_BUDGET_EXCEEDED | `/overview/budgets/[month]` | Current month budget (existing) |
| HIGH_UNCATEGORISED_SPEND | `/overview/budgets/[month]` | Current month budget (existing) |
| GOAL_DEADLINE_APPROACHING | `/goals/[goal-slug]` | The goal itself (was `/goals` list) |
| GOAL_NEGATIVE_BALANCE | `/goals/[goal-slug]` | The goal itself |
| DEBT_GREW_BEYOND_STARTING | `/goals/[goal-slug]` | The goal itself |
| GOAL_AUTO_REDUCE_TRIGGERED | `/goals/[goal-slug]` | The goal whose allocation was reduced |

## Deliberately linkless

None today. Every computed alert type has a natural inspect/resolve destination, so
every builder sets `href`. `Alert.href` remains optional: future informational types
with no actionable destination (e.g. market notes) intentionally omit it and render
without a link — add them here with a none-why when introduced.
