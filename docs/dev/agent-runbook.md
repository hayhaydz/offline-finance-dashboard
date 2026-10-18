# Agent Runbook — Dev Sessions on the Dashboard

One page. A fresh agent (or human) session should be able to boot, reset,
verify, and file findings from this document alone. Conventions and locks
live in `AGENTS.md` (read that first); this is the operational loop.

## 1. Boot the dev environment

Requires Node + npm install already done (`npm install`).

| Mode | When | How | DB used |
|---|---|---|---|
| **Plain** (default for agents) | No `ENCRYPTION_KEY` in `.env` | `npm run dev` → http://127.0.0.1:5173 | `storage/dev-plain.db` |
| **Encrypted** | `ENCRYPTION_KEY` set in `.env` | `npm run dev` | `storage/dev-encrypted.db` |

- `APP_ENV` must be `development` (it is, via `.env`).
- `DEV_AUTO_LOGIN=true` in `.env` makes `/login` auto-authenticate as the
  seeded `admin` user — no TOTP dance needed for agent sessions.
- Production build sanity: `npm run build && npm run preview` (port 4173).

**Agents: use plain mode.** Encrypted mode exists to test the encryption
code paths themselves.

## 2. Reset scratch data (one command)

```bash
npm run db:reset -- --scratch
```

Restores `storage/dev-plain.db` to the standard seed (wipe → migrations →
`seed:standard`). The command **aborts** if any of these hold:

- `APP_ENV=production`
- `ENCRYPTION_KEY` is set (encrypted mode — scratch is plain-only)
- `DATABASE_URL` points anywhere other than the plain scratch path

Other reset modes (also available): `npm run db:reset -- --mode=edge|stress`
for edge-case / volume seeds. See `scripts/reset.ts`.

## 3. Scratch credentials & data inventory (standard seed)

- **Login:** `admin` / `password` (or just visit `/login` with
  `DEV_AUTO_LOGIN=true`). MFA is seeded but auto-login bypasses it.
- **Accounts (16):** Main Current, Bills Current, Emergency Fund, ISA Saver,
  Stocks & Shares ISA, Visa Gold, Mastercard, Tesco Car Loan, 1-Year Fixed
  Bond, 2-Year Fixed Rate Bond, 5-Year Growth Bond, Rewards Card, Car Loan,
  Home Mortgage, High-APR Card, Old Savings (closed-with-history example).
- **Goals (3):** Emergency Fund, House Deposit, Holiday Fund.
- **Also seeded:** ~a year of transactions per account, interest-rate
  history, monthly snapshots, current-month budget, tax-band history,
  default spending categories.
- Fixtures are the source of truth: `scripts/seed/fixtures/standard/`.

## 4. Guardrails (non-negotiable — see AGENTS.md)

- `package.json` is **LOCKED** — no dependency changes without approval.
- Database is **LOCKED** — never touch raw SQLite files under `storage/`
  (except via the reset script), never run migrations without explicit
  permission. `storage/prod.db` and anything prod-shaped is off-limits.
- **Git is manual** — no `git add/commit/push` from agent sessions.
- Server logging via `$lib/utils/logger.ts` — no `console.log` in
  `*.server.ts`.
- Save points: add one line to `.docs/VERSION_HISTORY.md` instead of
  committing.

## 5. Verify your work

```bash
npm run check     # svelte-check (types)
npm test          # vitest (watch) — or: npm run test:run
npm run lint      # biome
```

QA rule: `npm run check` + `npm test` after every unit of work.

## 6. File findings

Notes go to `.docs/notes/YYYY-MM-DD/` (create the folder for today),
numbered `NN-slug.md`, one theme per note. Status header, what was
observed, evidence, and a proposed fix. Plans and brainstorms go to
`.docs/plans/` etc. per AGENTS.md — notes are for observed findings.

## 7. Browser-driven audit methodology

The proven pattern for hands-on QA sessions (Chrome via DevTools MCP
against the dev server, both seeded and organically-grown accounts, flow
simulations, deliberate destructive tests with cleanup):

→ **`.docs/notes/2026-10-13/00-methodology.md`** (coverage checklist +
known gaps). Follow it as the template for any new audit/UX pass.

## 8. Data anonymiser (shareable bug-repro copies)

Turns a **copy** of a real DB into fake-but-shape-preserving data for bug
reports and agent sessions. Never operates on the live DB.

```bash
# 1. Take a filesystem copy (plain-mode DBs only) OUTSIDE storage/
cp storage/dev-plain.db /tmp/source.db

# 2. Anonymise (seed makes it reproducible; keep the seed with the report)
npx tsx scripts/anonymise.ts --source /tmp/source.db --out /tmp/anon.db --seed 42
```

What it does (see `scripts/anonymise.ts` for the full contract):

- **Dates:** whole-month shift (seed-derived, constant per run) — month
  grouping, pagination boundaries and intervals keep their shape.
- **Amounts:** ±5% proportional jitter — sign and scale preserved, zeros
  stay zero, budgets/alerts still trigger realistically.
- **Text:** seeded word-list renames of names/descriptions/institutions
  (word count and length class preserved); slugs regenerated (21-char
  nanoid-alphabet, seeded).
- **Auth:** usernames faked, passwords reset to `password` (argon2,
  fixed salt), TOTP replaced with a documented dummy secret, session
  tokens regenerated. The printed summary lists the fake login username.
- **Determinism:** same source + same seed → identical output.
- **Refusals:** aborts if source/out resolves to a configured live DB or
  anything under `storage/`; aborts naming any schema table/column with
  no transform rules (schema drift fails loud — add rules, don't skip).

**Manual verification (last done 2026-10-18, PASS):** anonymised copy of
the plain dev DB → self-check green (integrity + FK + tables) → booted in
dev mode (`DATABASE_URL=/tmp/anon.db npm run dev`) → inserted a session
row for the printed fake user → homepage alerts, budgets page and account
pages render plausibly (totals within ±5% of source, month grouping
intact). Output is for bug repro, **not publication** — structure is
intentionally preserved, so rare residual shape leakage is by design.

**Maintenance:** when a table/column is added to
`src/lib/db/schema/`, the anonymiser aborts until `TABLE_RULES` in
`scripts/anonymise.ts` classifies it. Never weaken the guard by adding a
catch-all rule.
