## Why

When an import goes wrong there is no recovery path except clicking through the UI row by row (`.docs/notes/2026-10-18/` note 02, sources 2026-05-17 + 2026-10-16). The user wants a **single-spreadsheet model** (user decision, 2026-10-18): one export containing every account's transactions keyed by an account identifier, edited in one place, reimported as one file — with export options to filter/adjust what comes out. No export or batch mutation exists at HEAD.

## What Changes

- **One spreadsheet, all accounts**: the export contains every account's transactions in a single CSV; each row carries `account_slug` + `id`. A per-account file is just an export filtered to one account — not a separate mode.
- **Export options**: account selection, date range, and transaction-type filter as export parameters, so the round-trip can be scoped (e.g. "credit card + current, 2026/27 tax year").
- **Unified reimport — insert, edit, delete in one file**: rows with an `id` are matched and edited; rows marked `_delete=1` are hard-deleted; rows **without** an `id` are inserted (resolved via their `account_slug`). Foreign/unmatched ids and foreign slugs are refused at file level.
- **Automatic pre-import backup (user expectation)**: before any reimport commit, the system writes a timestamped "before" CSV of every row the import will touch, and offers it for download on the result screen. The preview gate stays: exact `N inserted / N edited / N deleted / N skipped` plus per-row diffs before anything is written; commit is one atomic transaction.
- **Restore path**: backup files reimport through an explicit recovery mode that upserts by `id` (restores values, reinserts deleted rows with their original ids). The normal mode stays strict — unmatched ids are typos and are refused.
- **Preview parity with accounts page** (from 2026-05-17 note): import previews render with the same monthly-ledger grouping (month headers, inflow/outflow/net) as the accounts page.

## Capabilities

### New Capabilities

- `transaction-csv-export`: Single-spreadsheet export of all accounts' transactions (filterable by account, date range, type) with importer-compatible columns, `account_slug` + `id` per row, RLS-scoped
- `transaction-csv-reimport`: Unified insert/edit/delete reimport with diff preview, automatic pre-commit backup, atomic commit, and an explicit backup-restore mode

### Modified Capabilities

(none)

## Impact

- **Files**: new export route + parameters, `src/lib/server/imports-update.ts` (unified updater: insert/edit/delete), backup writer, reimport UI (upload → preview → confirm → result+backup), import wizard preview refactor
- **Schema**: none (uses existing `accountTransactions.id` and `accounts.slug`)
- **Security**: export and updater queries must use `withUserFilter`; reimport never trusts row ownership from the CSV itself
- **Non-goals**: bank-statement parsing, scheduled exports, in-app undo (backup file IS the undo)
