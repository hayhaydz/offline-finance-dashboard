## Context

Note 14: agent sessions work ad-hoc (2026-10-13 audit proved the pattern) but nothing is documented; real data can't be shared or handed to agents, and synthetic seeds don't reproduce data-shaped bugs. Adjacent existing tooling: `scripts/reset.ts`, `scripts/create-test-accounts.ts`, three-mode seed system, `scripts/migration-preflight.ts`.

## Goals / Non-Goals

**Goals:**
- `docs/dev/agent-runbook.md` — the repeatable agent loop (boot, scratch reset, guardrails, findings workflow)
- One-command scratch environment reset
- `scripts/anonymise.ts` — deterministic, structure-preserving anonymisation of a DB *copy*

**Non-Goals:**
- Any app-source changes; CI automation; remote agent orchestration
- Anonymising statements/uploads (out of app data scope)
- Perfect statistical privacy (structure preservation intentionally leaks shapes — the point)

## Decisions

1. **Runbook content contract** — boot (plain vs encrypted dev mode), seeded credentials + accounts inventory, guardrails (package.json LOCKED, DB LOCKED, no git, no prod paths), verification commands (`npm run check`, `npm test`), findings convention (`.docs/notes/YYYY-MM-DD/` per AGENTS.md), pointer to the 2026-10-13 audit methodology. One page, no essay.
2. **Scratch reset** — extend `scripts/reset.ts` with a `--scratch` mode (or `scripts/agent-env.ts` wrapper) that resets `dev-plain.db` to standard seed; refuses to run when `ENCRYPTION_KEY`/prod paths are involved.
3. **Anonymiser transforms** (the bug-shape contract from note 14):
   - **Dates**: constant offset per run, a **whole number of months** (seed-derived), applied to all date/timestamp columns — preserves month grouping exactly (a 30th never drifts into the next month), keeps intervals identical, and shifts tax-year windows rigidly (edge rows at Apr 6 boundaries aside). Day-level offsets would blur month boundaries and mask the very pagination/month-splitting bugs this exists to reproduce.
   - **Amounts**: proportional jitter within ±5% band (sign preserved; zeros stay zero) — budgets/alerts still trigger at similar thresholds. Rounded to pence; no amount ever crosses zero.
   - **Text**: names/descriptions → deterministic fake replacements (word-list based, seeded); structure preserved (length class, number of words). Slugs regenerated from fake names (nanoid(21) per AGENTS.md slug rule).
   - **Determinism**: `--seed X` reproduces the exact same output for the same input.
4. **Safety rails** — operates only on an explicit `--source <file> --out <file>` pair; refuses if source path resolves to a live configured DB or `storage/` prod location; never logs source values; post-run self-check opens the output DB and verifies integrity (tables present, FK check) and prints plausible-range summary (no identity strings).
5. **Table coverage via schema introspection** — walks `src/lib/db/schema` table list; unmapped new tables fail loudly ("add transform rules") instead of silently copying personal data.

## Risks / Trade-offs

- [Residual identity leakage via rare descriptions] → runbook states the output is for bug repro, not publication; combination of rename + jitter is best-effort by design.
- [Schema drift breaks coverage] → loud failure on unmapped tables (decision 5) + runbook maintenance note.

## Migration Plan

Additive scripts + docs only. No rollback concerns.
