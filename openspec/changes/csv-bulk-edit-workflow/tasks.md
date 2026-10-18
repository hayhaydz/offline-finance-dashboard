## 1. Export

- [ ] 1.1 Authenticated GET export route streaming a single multi-account CSV (`account_slug` + `id` per row, importer-compatible columns); RLS-scoped via `withUserFilter`; custom logger
- [ ] 1.2 Export options as query params: account selection, `from`/`to` date range, type filter
- [ ] 1.3 `[Export CSV]` bracket-link affordances on accounts index (full export) and account detail (pre-scoped export)
- [ ] 1.4 Tests: user-scoping, filters, column parity with importer, slug correctness

## 2. Unified updater engine

- [ ] 2.1 New `src/lib/server/imports-update.ts`: parse + validate every field with append-import validators; row semantics (id → edit/delete, no-id → insert via `account_slug`); refuse unknown/foreign/mismatched rows at file level with row numbers
- [ ] 2.2 Preview stage: compute `{ inserted, edited, deleted, skipped }` + per-row field diffs (field, before, after) without writing
- [ ] 2.3 Backup writer: on confirm, timestamped "before" CSV of touched rows' pre-state (edited old values + deleted full rows) with `# backup of` header; downloadable from result screen
- [ ] 2.4 Commit stage: single DB transaction applying inserts/edits/deletes; logger records batch summary (counts only, no personal data)
- [ ] 2.5 Recovery mode: explicit toggle upserting by id (restore values, reinsert deleted with original ids); suggested automatically when a backup header is detected
- [ ] 2.6 Reimport UI (upload → preview with diffs → confirm → result + backup download); terminal aesthetic

## 3. Import preview parity

- [ ] 3.1 Refactor import wizard preview to render through the accounts-page monthly grouping (`transaction-grouping.ts`) with month headers + inflow/outflow/net
- [ ] 3.2 Fold in audit backlog #6 while touching the wizard: render server failures with human copy instead of raw `error.message`

## 4. QA

- [ ] 4.1 Tests: full round-trip (export → edit+delete+insert → reimport → assert all three), atomicity, foreign-row refusal, backup content and restore round-trip (delete → restore → original id and values)
- [ ] 4.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
