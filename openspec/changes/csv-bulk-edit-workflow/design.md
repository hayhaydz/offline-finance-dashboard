## Context

No export or batch mutation exists at HEAD. The current import (`src/lib/server/imports.ts`) is append-only with overlap detection. User decisions (2026-10-18): **1-spreadsheet model** — one export keyed by account identifier, one reimport that does everything; **automatic backup before import** — the user assumes a full pre-import state is captured; preview is the gate.

## Goals / Non-Goals

**Goals:**
- Single CSV covering all accounts (filterable), `account_slug` + `id` on every row
- Unified reimport: insert (no id) + edit (id match) + delete (`_delete`) in one file, atomically
- Auto "before" backup of touched rows, downloadable; explicit recovery mode restores from it
- Import preview parity with the accounts ledger

**Non-Goals:**
- In-app undo/recycle bin (the backup file is the undo)
- Bank statement parsing, scheduled exports, conflict merging
- Editing rows of accounts not present in the file via slug typos (refused, not guessed)

## Decisions

1. **`account_slug` + `id` on every row** — slugs satisfy the no-IDs-in-URLs rule (ids live in CSV cells and DB only). Multi-account is the default shape; scoping happens via export options (accounts, from, to, type), not via separate modes.
2. **Unified row semantics** — `id` present: edit (or delete if `_delete=1`). `id` absent: insert, `account_slug` required and must resolve to the user's account (RLS-checked), full field validation as per append import. Unknown `id` (missing or another user's): file-level refusal listing offending rows — typo protection. `id` + `account_slug` mismatch: refusal.
3. **Safety chain = preview → backup → commit** — preview computes exact changes (per-row field diffs) without writing; on confirm, the system first writes a timestamped "before" CSV containing the pre-state of every row the import touches (edited rows' old values + deleted rows' full rows; inserted rows have no pre-state), then commits in one DB transaction. Result screen offers the backup for download.
4. **Recovery mode for backups only** — backup files reimport via an explicit "restore from backup" toggle that upserts by `id`: existing rows restored to backed-up values, missing (previously deleted) rows reinserted with original ids. Normal mode never upserts. Backups are marked with a header line (`# backup of <scope> at <timestamp>`) so the UI can suggest recovery mode.
5. **Updater is a separate server module from append-import** (`imports-update.ts`) — the append flow (overlap detection) stays untouched; overlap detection is wrong for edits (it would flag edited rows as duplicates).
6. **Insert validation reuses append-import validators** — enum types, finite amounts, parseable dates, description/category length caps; one bad row rejects the file (atomic all-or-nothing), reported by row number.
7. **Preview parity**: import wizard preview renders through the accounts-page monthly grouping (`transaction-grouping.ts`) — month headers, inflow/outflow/net — so what you confirm looks like what you'll see on the account page.
8. **Export endpoint** — authenticated GET with query params (`accounts`, `from`, `to`, `type`), streaming CSV with `Content-Disposition`; RLS-scoped; custom logger.

## Risks / Trade-offs

- [Unified file = bigger blast radius per import] → preview shows every change; backup captures touched pre-state; atomic commit means no partial application.
- [Backup only covers touched rows] → untouched rows were never at risk from that import; full-DB backup is out of scope (the anonymiser change and `scripts/` handle wholesale copies).
- [Spreadsheet mangles values] → full revalidation of every row; file-level rejection with row numbers; no silent coercion.
- [Recovery mode upserts] → restricted to the explicit toggle; normal imports stay typo-strict.

## Migration Plan

Purely additive (new route + module + backup writer). No schema change. Rollback = remove routes/module.
