# Offline Finance Dashboard

A privacy-first, local-only financial dashboard for tracking net worth and account history. Built with a terminal-inspired aesthetic and a "manual truth" philosophy — you enter your balances, not a bot.

## Quick Start

```bash
npm install
npm run db:push
npm run seed:standard
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
│   ├── (auth)/        # Login, register, MFA setup
│   ├── accounts/      # Account management
│   ├── goals/         # Goal tracking
│   ├── snapshots/     # Net worth snapshots
│   └── settings/      # Profile, security, data
└── hooks.server.ts    # Auth middleware, rate limiting
```

---

## Environment Modes

Controlled by `APP_ENV`:

| Mode | Database | Security | Encryption |
|------|----------|----------|------------|
| `development` | `storage/dev.db` | Loose (plain text OK) | Optional |
| `production` | `storage/prod.db` | Strict (fails if unencrypted) | Required |

### Dev Mode

```bash
npm run db:push        # Push schema directly (no migration files)
npm run seed:standard  # Creates admin/password user
npm run dev            # Starts on localhost:5173
```

Security is loose — you can use SQLite viewers directly on the dev database.

### Production Mode

```bash
export APP_ENV=production
export ENCRYPTION_KEY=$(openssl rand -hex 32)  # Save this somewhere safe!

npm run db:migrate     # Official migrations
npm run build
npm run preview
```

The app will refuse to start if encryption is missing or if it finds unencrypted user data. Lose the key, lose the data.

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
npm run db:reset && npm run seed:standard

# Generate migration after schema change
npm run db:generate && npm run db:migrate

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
