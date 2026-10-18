## Context

13 transaction types exist (`src/lib/utils/domain-constants.ts:70-84`) with undefined semantics; the creator hardcodes 7 (`TransactionsSection.svelte:107-113`); budgets count only `withdrawal`+`charge` (`budgets.ts:88,148,261`); credit-card refunds live in `value_change`. Notes 01 + 05 in `.docs/notes/2026-10-18/`.

## Goals / Non-Goals

**Goals:**
- One authoritative glossary; creator/importer render from `TRANSACTION_TYPES`
- `refund` type with budget netting; explicit spending rules for budgets
- Existing `value_change` refunds migratable at the user's choice

**Non-Goals:**
- Monzo Flex per-transaction interest modelling (separate future design doc — note 01 §6)
- Removing/renaming existing types (additive only; no breaking data changes)
- Auto-migration of historical `value_change` rows

## Decisions

1. **Glossary rulings** (to be restated in `docs/transactions/type-glossary.md` and helper text):
   - `deposit` = external money in (salary, cash in). `withdrawal` = external money out (spending).
   - `transfer_in`/`transfer_out` = movements between the user's own accounts; never spending; net to zero across accounts.
   - `interest` = credited/paid. `interest_accrued` = unrealised accrual — excluded from cash balance and from ISA/PSA "paid" totals.
   - `interest_charge` = interest added to a liability balance. `charge` = card/fee spending on a liability. `payment` = repayment of a liability (reduces debt; NOT spending).
   - `refund` (new) = reversal of a prior external purchase on any account; nets against spending.
   - `value_change` = market value movement of investments only.
2. **Spending = `withdrawal` + `charge` − `refund`** for budgets (fixes `payment`-typed card spend vanishing: `payment` remains a liability repayment, not spending — matches the glossary, no budget change needed for it). Transfers remain excluded.
3. **Creator renders from `TRANSACTION_TYPES`** with a label map + one-line helper text per type; type list filtered by account category (e.g. `loan_disbursement` only on loans) — the filter map lives in `domain-constants.ts` beside the enum.
4. **`refund` is additive**: schema enum + `db:push` (active-dev phase), seed updated same commit, import validators pick it up automatically via `TRANSACTION_TYPES`.
5. **Migration offer, not auto-run**: a settings/data utility lists `value_change` rows with negative amounts on credit-card accounts and offers one-click reclassification to `refund`. Nothing changes silently.

## Risks / Trade-offs

- [Budget totals shift once refunds net] → historical budget months may show lower spending after backfill; called out in the utility UI before applying.
- [Glossary is a social contract, not code] → helper text + import template headers restate the rules where data enters.
- [Type-filtered creator hides valid combos] → filter map is permissive-by-default; unknown account types show all types.

## Migration Plan

`db:push` for enum addition → seed update → code. Rollback: enum additions are backward-safe (no data removed).
