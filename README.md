# Offline Finance Dashboard

A privacy-first, local-only financial dashboard designed for high-integrity tracking of net worth and account history. Built with a terminal-inspired aesthetic, it prioritizes manual truth over automated convenience.

## 🏛️ High-Level Concepts

### The "Manual Truth" Philosophy
This app intentionally avoids bank APIs (Plaid/Yodlee). Users manually input balances once a month. This "intentional friction" ensures you actually engage with your data and maintain a truthful belief about your financial state.

### Core Entities
- **Accounts**: Containers representing real-world financial entities (Savings, Investments, Credit).
- **Balances**: Your current *belief* of an account's value. These are updated manually.
- **Snapshots**: Immutable, frozen reports of your total net worth at a specific point in time (usually monthly).
- **Statements**: Atomic historical records of transactions. They serve as the audit trail for accounts.

## 🚀 Environment Setup

The application uses a tiered environment strategy driven by the `APP_ENV` variable.

### 1. Development Mode (`development`)
- **Purpose**: Local feature work, UI testing, and rapid iteration.
- **Database**: Uses `storage/dev.db`.
- **Security**: **Loose Mode**. 
    - Defaults to unencrypted (plain text) for easy debugging with SQLite viewers.
    - If `ENCRYPTION_KEY` is present, it will attempt encryption but fall back to plain text if keys mismatch.
- **Setup**:
```bash
# 1. Install dependencies (includes tsx for scripts)
npm install

# 2. Push schema to DB (Fast dev iteration, no migration files needed)
npm run db:push

# 3. Seed test data (Creates 'admin' / 'password')
npm run db:seed

# 4. Start Dev Server
npm run dev
```

### 2. Production Mode (`production`)
- **Purpose**: Actual usage with your real financial data.
- **Database**: Uses `storage/prod.db`.
- **Security**: **Strict Mode**. 
    - The app will **fail to start** if `ENCRYPTION_KEY` is missing.
    - Scans for unencrypted data on startup and refuses to run if found.
    - Uses proper migration files (`drizzle/`) instead of `db:push`.
- **Setup**:
```bash
export APP_ENV=production
# Generate a strong key (Save this securely! If lost, data is unrecoverable)
export ENCRYPTION_KEY=$(openssl rand -hex 32)

# Run official migrations (Not db:push)
npm run db:migrate

# Build & Preview
npm run build
npm run preview
```

## 🛠️ Usage Loop
1. **Login**: Authenticate via Argon2id password + TOTP MFA.
2. **Update**: Navigate to `[Accounts]` and enter current balances.
3. **Freeze**: Use `[Create Snapshot]` to lock in your current net worth for history.
4. **Exit**: Terminate the session to clear encryption keys from memory.

## 🔒 Security Model
- **Offline-First**: Zero cloud dependencies. Your data never leaves your machine.
- **Trusted Zone (WSL2)**: All cryptographic operations and database access happen in the Linux subsystem.
- **Untrusted Zone (Windows)**: The browser only receives sanitized data; it never sees raw secrets or hashes.
- **Encryption**: AES-256-GCM for sensitive fields and SQLCipher for the database-at-rest.

---
*For detailed technical information, see `docs/architecture/technical-summary.md`.*