# Offline Finance Dashboard

A privacy-first, local-only financial dashboard for tracking net worth and account history. Built with a terminal-inspired aesthetic and a "manual truth" philosophy — you enter your balances, not a bot.

## Quick Start

```bash
npm install
npm run db:reset -- --mode=standard
npm run dev
```

Log in at `http://localhost:5173` with `admin` / `password`.

---

## What This Actually Does

**Manual balance tracking** — No bank APIs, no automatic syncing. You open the app, update your account balances, and that's it. Sounds tedious? That's the point. "Intentional friction" means you're forced to actually engage with your money once a month instead of setting it and forgetting it.

**Account types** — Current, savings, investments, credit cards, loans, mortgages. Tag them with tax wrappers (ISA, LISA, Premium Bonds) and liquidity tiers (instant access, delayed, locked).

**Transaction ledger** — Every deposit, withdrawal, interest payment, and dividend is recorded. Balance is always the sum of transactions, never a manually-set number that might drift.

**Goal tracking** — Allocate money to specific targets (emergency fund, holiday fund, whatever). The app tracks your "Ready to Assign" pool and warns you if your goals are over-allocated.

**Net worth snapshots** — Freeze your total net worth at a point in time. Compare month-over-month to see if you're winning or losing.

**Interest tracking (UK)** — Personal Savings Allowance (PSA) limits, ISA allowance remaining, per-account interest projections with maturity awareness for fixed-term bonds. Tax year runs April 6 to April 5.

**Credit cards with intent (v3)** — Each card is in *pay-off (panic)* or *stooze* mode. Panic shows payoff projection pressure; stooze shows friendly 0%-window reminders and what to have ready, with zero pressure. Per-charge plans (pay now vs over time) with a 3-month target tracker that respects statement delay (confirmed-through = last month-end).

**A Matrixify-class data pipeline (v3)** — `/settings/data`: self-describing CSV export (per-account selection + context), round-trip reimport (drop/create/move across accounts by editing the export), expenses/income history CSV both ways, Monzo-preset bulk bank import with column mapping, and a background job queue for big files (sealed at rest).

**Reports, dated like papers (v3)** — `/overview/reports`: separate dated reports in a science-paper structure (abstract/method/findings) — net-worth trajectory, savings rate & runway, interest vs PSA, credit strategy, spending profile, debt horizon, income vs deposits. ASCII render mode included.

**A tools wing (v3)** — `/tools`: rate-change what-if, overpayment simulator, ISA optimiser, compound projector, stooze calculator, FI milestone projector — each a full sub-page over your live data.

**Bills from evidence (v3)** — `/overview/bills`: recurring payments detected from actual transactions (≥3 occurrences, monthly cadence), with an *emerging* watchlist at two occurrences — no bill list to maintain.

**Budgets, alerts, routine** — month budgets with pace/burn-down and amendments; severity-laned alerts; a monthly review routine with streaks.

---

## Project Structure

```
src/
├── lib/
│   ├── components/     # Svelte UI components
│   ├── db/            # Database client, schema, migrations
│   ├── server/        # Server-only logic (calculations, transactions)
│   ├── utils/         # Shared utilities
│   └── validation/    # Form validation rules
├── routes/
│   ├── (auth)/        # Login, register, recovery
│   ├── accounts/      # Accounts, interest, ISA, liabilities
│   ├── goals/         # Goal tracking (savings + debt payoff)
│   ├── overview/      # Snapshots, budgets, expenses, bills, reports, tax, routine
│   ├── tools/         # Calculator sub-pages (registry-driven)
│   └── settings/      # General, profile & session, security, data pipeline
└── hooks.server.ts    # Auth middleware, rate limiting
```

Extension surfaces (v3): reports live in `src/lib/server/reports-v2.ts` (one builder per paper), tools in `src/lib/utils/tool-registry.ts` — a new entry in either appears in the ⌘K palette automatically (a sync test pins the mirror).

---

## Environment Modes

Controlled by `APP_ENV`:

| Mode | Database | Security | Encryption |
|------|----------|----------|------------|
| `development` | `storage/dev-plain.db` or `storage/dev-encrypted.db` | Loose (plain text OK) | Optional |
| `production` | `storage/prod.db` | Strict (fails if unencrypted) | Required |

### Dev Mode

```bash
npm run db:reset -- --mode=standard
npm run dev            # Starts on localhost:5173
```

Security is loose — you can use SQLite viewers directly on the dev database.

### Production Mode

```bash
export APP_ENV=production
export ENCRYPTION_KEY=$(openssl rand -hex 32)  # File-layer key (machine-local)

npm run build
npm run start          # Startup auto-applies pending migrations; boots SEALED
```

The app will refuse to start if file-layer encryption is missing or if it finds unencrypted user data.

**Custody model (envelope keyring):** `ENCRYPTION_KEY` protects the DB file at rest only — it is not the data master key. Your data is encrypted under a per-user DataKey that exists only in memory between unlock and seal: the disk alone (DB file + `.env` + code) can never reassemble it. Unlock requires your password; lose the password AND the recovery paper and the data is unrecoverable — there is no reset.

---

## Logging

All server-side logs go to files (no CLI output):

```bash
# Tail today's logs
tail -f logs/application-$(date +%Y-%m-%d).log

# Tail errors only
tail -f logs/error-$(date +%Y-%m-%d).log

# Both combined
tail -f logs/application-$(date +%Y-%m-%d).log logs/error-$(date +%Y-%m-%d).log
```

Logs rotate daily, max 20MB per file, kept for 30 days.

In development mode, `devLog()` calls write to the application log with full context. In production, only errors are logged and sensitive data is sanitized.

Set `VERBOSE_DEBUG_LOGS=true` in development for extra detail.

---

## Security

- **Argon2id** password hashing (64MB memory, OWASP compliant)
- **TOTP MFA** via authenticator app + 10 backup codes
- **AES-256-GCM** for encrypting TOTP secrets
- **SQLCipher** for database-at-rest encryption
- **Single session** per user, 24-hour timeout
- **Rate limiting** with exponential backoff (5 attempts → 15 min lockout)
- **HTTP-only cookies**, localhost-only access
- **Zero cloud dependencies** — everything stays on your machine

---

## Common Tasks

```bash
# Reset dev database
npm run db:reset -- --mode=standard

# Generate migration after schema change
npm run db:generate
npm run db:reset -- --mode=standard

# Seed different test data sets
npm run seed:edge   # Edge cases
npm run seed:stress # Lots of records

# Open DB in Drizzle Studio
npm run db:studio

# Run diagnostics on DB
npm run db:doctor
```

---

## Tech Stack

SvelteKit + Svelte 5 · TypeScript · SQLite (better-sqlite3 + SQLCipher) · Drizzle ORM · Tailwind CSS · Winston (logging) · Argon2id · TOTP

---

## License

Do whatever you want with it.
