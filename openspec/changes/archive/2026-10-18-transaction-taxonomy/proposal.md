## Why

The transaction type enum has grown to 13 values (`.docs/notes/2026-10-18/` note 01, sources 2026-04-30 → 2026-10-16) with no documented semantics: `deposit` vs `transfer_in` is undefined, `interest` vs `interest_accrued` is undefined, credit-card refunds are shoehorned into `value_change`, the UI creator offers only 7 of 13 types while CSV import accepts all 13, and the budget silently counts only `withdrawal` + `charge` (`src/lib/server/budgets.ts:88,148,261`) — so anything imported as `payment` vanishes from budgets. This is the root cause of several "numbers feel wrong" complaints.

## What Changes

- **Type glossary** (docs + UI): one authoritative definition per type in `docs/` and as helper text in the transaction creator form. Key rulings to make: `deposit` = external money in; `transfer_in`/`transfer_out` = movements between own accounts; `interest` = paid/credited; `interest_accrued` = unrealised accrual (excluded from cash balance).
- **Creator form from single source of truth**: `TransactionsSection.svelte:107-113` hardcodes 7 options; render all types from `TRANSACTION_TYPES` with human labels.
- **New `refund` type** (schema enum addition, additive): credit-card CR entries get a first-class type; budget math nets refunds against spending. Migration for existing `value_change` rows is a manual decision (offered as import-time tooling, not automatic).
- **Budget spending definition made explicit and correct**: document which types count as spending (`withdrawal`, `charge`, and decide `payment`'s fate), fix `budgets.ts` filters to match, and surface the definition in the budget UI.
- **Monzo Flex per-transaction interest**: out of scope here — needs its own design doc (note 01 §6). Recorded as non-goal.

## Capabilities

### New Capabilities

- `transaction-taxonomy`: Authoritative type glossary, creator/importer parity (both use `TRANSACTION_TYPES`), and the `refund` type with budget netting rules
- `budget-spending-rules`: Explicit, documented definition of which transaction types constitute "spending" for budgets, enforced consistently in all budget queries and shown in the budget UI

### Modified Capabilities

(none — no existing specs cover transactions or budgets)

## Impact

- **Schema**: `accountTransactions.type` enum + `TRANSACTION_TYPES` + csv-parser/imports validation lists gain `refund` (additive; direct `db:push` per active-dev phase, seed updated immediately)
- **Files**: `src/lib/db/schema/*`, `src/lib/utils/domain-constants.ts`, `src/lib/components/account/TransactionsSection.svelte`, `src/lib/server/budgets.ts`, `src/lib/server/imports.ts`, `src/lib/utils/csv-parser.ts`, budget UI pages
- **Coordination**: `budget-filtering-feedback` change depends on the spending-rules decision made here
