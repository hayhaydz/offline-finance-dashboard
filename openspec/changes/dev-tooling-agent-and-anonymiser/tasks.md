## 1. Agent runbook

- [ ] 1.1 Write `docs/dev/agent-runbook.md`: boot modes (plain/encrypted), scratch credentials + accounts inventory, guardrails (package.json LOCKED, DB LOCKED, no git ops, no prod paths), `npm run check` / `npm test`, findings convention (`.docs/notes/YYYY-MM-DD/`), pointer to `.docs/notes/2026-10-13/00-methodology.md`
- [ ] 1.2 Scratch reset: `--scratch` mode on `scripts/reset.ts` (or `scripts/agent-env.ts`) restoring standard seed; abort on encrypted/prod path detection

## 2. Anonymiser core

- [ ] 2.1 `scripts/anonymise.ts` CLI: `--source <file> --out <file> [--seed X]`; path guard against live configured DBs and `storage/` locations; never log source values
- [ ] 2.2 Date transform: constant per-run offset (seed-derived) across all date/timestamp columns
- [ ] 2.3 Amount transform: ±5% proportional jitter, sign-preserved, zeros intact, pence-rounded
- [ ] 2.4 Text transform: seeded word-list renames preserving length class/word count; slug regeneration (nanoid(21))
- [ ] 2.5 Table coverage from schema introspection; abort naming uncovered tables
- [ ] 2.6 Post-run self-check: integrity (FK, tables) + plausibility summary without identity strings

## 3. QA

- [ ] 3.1 Tests (script-level): determinism (same seed → identical output), shape preservation (month-boundary fixture), sign/scale invariants, refusal paths (live DB, uncovered table)
- [ ] 3.2 Manual: anonymise a dev copy → boots in dev mode → budgets/alerts render plausibly; document in runbook
- [ ] 3.3 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
