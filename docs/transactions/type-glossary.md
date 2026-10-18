# Transaction Type Glossary

Authoritative definitions for every `accountTransactions.type` value. The enum
lives in `src/lib/utils/domain-constants.ts` (`TRANSACTION_TYPES`); this document
is the semantic contract. Every surface where types enter data (transaction
creator, CSV import, reclassification tools) defers to these rulings.

## Money-in / money-out (external)

| Type | Definition | Amount sign | Counts as spending |
|---|---|---|---|
| `deposit` | External money **into** an account (salary, cash in, interest from elsewhere). | positive | no |
| `withdrawal` | External money **out** of an account — real spending. | negative | **yes** |
| `refund` | Reversal of a prior external purchase on any account (shop refunds a card purchase). Nets against spending. | positive | **yes (negative)** |

## Transfers (internal)

| Type | Definition | Amount sign | Counts as spending |
|---|---|---|---|
| `transfer_in` | Money arriving from **your own** account. Never income. | positive | no |
| `transfer_out` | Money leaving to **your own** account. Never spending. | negative | no |

`transfer_in`/`transfer_out` pairs net to zero across accounts. Neither appears
in budgets, spending totals, or income. Net worth is unaffected by internal
transfers because every account is summed.

## Interest

| Type | Definition | Amount sign | In cash balance | In tax/ISA "paid" totals |
|---|---|---|---|---|
| `interest` | Interest **credited/paid** by the institution. | positive | yes | **yes** |
| `interest_accrued` | Unrealised accrual (e.g. fixed bond accumulating before maturity payout). | positive | **no** | **no** |

When an accrued balance is eventually paid out, record the payout as `interest`.
`interest_accrued` is excluded from derived balances and from interest/PSA/ISA
"paid" actuals — it is a projection of future money, not cash.

## Investments

| Type | Definition | Amount sign |
|---|---|---|
| `dividend` | Dividend paid by an investment holding. | positive |
| `value_change` | Market value movement of **investments only**. Never used for card refunds — use `refund`. | signed |

## Liabilities (credit cards, loans, mortgages)

| Type | Definition | Amount sign | Counts as spending |
|---|---|---|---|
| `charge` | Card/fee spending added to a liability balance (increases debt). | negative | **yes** |
| `payment` | Repayment of a liability (reduces debt). **Not spending.** | positive | no |
| `interest_charge` | Interest added to a liability balance. | negative | no |
| `loan_disbursement` | Initial loan amount received (loan accounts only). | negative | no |
| `mortgage_disbursement` | Initial mortgage amount received (mortgage accounts only). | negative | no |

Liability balances are the sum of signed amounts and read negative (debt):
charges and interest charges push the balance down, payments push it back up.

## Budget spending definition

**Spending = `withdrawal` + `charge` − `refund`** (absolute amounts).

Excluded from budgets: `payment` (debt repayment, not consumption), all
transfers, `deposit`, `dividend`, `interest`/`interest_accrued`,
`value_change`, `interest_charge`, and disbursements. This definition is
enforced identically in every budget query (`src/lib/server/budgets.ts`) and is
surfaced in the budget UI filter panel.

## Creator availability by account type

The creator filters the type list per account type (`ACCOUNT_TYPE_ALLOWED_TRANSACTIONS`
in `domain-constants.ts`); unknown account types see all types (permissive
default). The CSV importer accepts every type in `TRANSACTION_TYPES`; a type
importable on a compatible account is also selectable in the creator for that
account type.

## Historical note

Credit-card refunds recorded as `value_change` predate the `refund` type. The
settings → data page lists candidate rows (`value_change`, negative amount,
credit-card account) and offers a confirmed one-click reclassification to
`refund`. Nothing is migrated silently.
