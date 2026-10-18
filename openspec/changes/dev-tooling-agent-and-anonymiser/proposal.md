## Why

Two dev-tooling ideas from `.docs/notes/2026-10-18/` note 14 (source 2026-10-18): (1) LLM-agent sessions against the dashboard work (the 2026-10-13 audit proved the pattern — Chrome DevTools + dev server + filed notes) but rely on ad-hoc knowledge each time; (2) real personal data can't be shared in bug reports or handed to agent sessions, and regenerating synthetic seed data doesn't reproduce data-shaped bugs.

## What Changes

- **Agent runbook** (`docs/dev/agent-runbook.md`): how to boot dev (plain vs encrypted mode), seeded credentials and which accounts exist, what may never be touched (`package.json` LOCKED, prod DB LOCKED, no git commits), how to run `npm run check` / `npm test`, where findings go (`.docs/notes/YYYY-MM-DD/` convention), and the Chrome DevTools audit methodology pointer (`.docs/notes/2026-10-13/00-methodology.md`).
- **Scratch reset command** (`scripts/agent-env.ts` or extension of existing `scripts/reset.ts`): one command that resets a scratch DB to a known seeded state (never touching prod paths) so agent sessions start reproducible.
- **Data anonymiser** (`scripts/anonymise.ts`): transforms a *copy* of a real DB into shareable fake data while preserving bug shapes — the explicit requirement from the note:
  - constant date-shift (preserves intervals, month boundaries, pagination-splitting shapes)
  - proportional amount jitter within a band (preserves sign and rough magnitude so budgets/alerts still trigger realistically)
  - structure-preserving renames (account names/descriptions loremised; slugs regenerated to match)
  - deterministic seed input for reproducible runs
  - never reads or writes the live DB (respects DATABASE LOCKED rule); operates on a file copy only
- **Verification**: anonymised DB must pass the app's own integrity checks and load in dev with totals in plausible ranges.

## Capabilities

### New Capabilities

- `agent-dev-runbook`: A repeatable, documented loop for LLM-agent sessions against the dashboard — environment boot, scratch reset, guardrails, and findings workflow
- `data-anonymiser`: A deterministic, structure-preserving anonymiser for DB copies that keeps bug-reproducing data shapes while removing all personal information

### Modified Capabilities

(none)

## Impact

- **Files**: new `docs/dev/agent-runbook.md`, new `scripts/anonymise.ts`, `scripts/agent-env.ts` (or extends `scripts/reset.ts`); no app source changes
- **Schema**: none (reads schema for table coverage; must be updated when tables change — noted in runbook)
- **Security**: anonymiser must never log or emit the source values; output DB has no relation to input identities
