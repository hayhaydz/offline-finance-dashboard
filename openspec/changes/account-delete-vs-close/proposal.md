## Why

`accounts.closedAt` is currently the soft-delete column (`src/lib/db/schema/accounts.ts:39` — "Soft-delete - NULL means open"), so "closed with history" and "removed" are the same state, and closed accounts sit wherever their creation date puts them in the accounts list (`+page.server.ts:54` sorts by `createdAt` only) (`.docs/notes/2026-10-18/` note 11, source 2026-05-08). Per user decision: build a **separate destructive delete** distinct from close, plus placement handling for closed accounts.

## What Changes

- **Separate `deletedAt`**: accounts gain a delete marker distinct from `closedAt`. `closedAt` = "done with this account, history preserved and still counted in tax/interest history". `deletedAt` = "this account was created by mistake".
- **Destructive delete is empty-accounts-only (user decision, 2026-10-18)**: hard delete is available **only when the account has zero transactions** — it exists to remove mistaken account creations. Accounts with any transaction history cannot be deleted; the UI directs to close instead. The delete removes the account row plus its notes and rate history, with a typed confirmation.
- **Closed-account placement**: closed accounts sort below open accounts within each type section on `/accounts`, behind a collapsed `[Show N closed]` toggle; separate-page option rejected in favour of the toggle. Closed accounts remain included in interest/ISA/tax-year history (placement changes must not exclude them from breakdowns).
- **Close-account feedback**: fold in audit backlog #10 — close-account failures currently render nowhere.

## Capabilities

### New Capabilities

- `account-deletion`: Empty-accounts-only hard deletion (zero transactions required) with a transaction-count gate, typed confirmation, and close-instead guidance for accounts with history — distinct from closing
- `closed-account-placement`: Closed accounts sort below open ones behind a collapsed toggle on the accounts index, while remaining fully included in historical tax/interest breakdowns

### Modified Capabilities

(none)

## Impact

- **Schema**: `accounts.deletedAt` (timestamp, nullable); queries switch soft-delete semantics from `closedAt` to `deletedAt` where "not deleted" is meant; `scripts/seed.ts` updated immediately
- **Files**: `src/lib/db/schema/accounts.ts`, `src/routes/accounts/+page.server.ts` + `+page.svelte`, new `src/routes/accounts/[slug]/delete/*` (already exists — extend for destructive mode vs close), goal allocation guard in `src/lib/server/goals.ts`
- **Risk note**: delete is gated to empty accounts, so the blast radius is a mistaken account row + its notes/rates; no bulk delete in this change
