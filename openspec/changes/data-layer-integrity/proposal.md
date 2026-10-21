# Proposal: data-layer-integrity

## Why

Audit data-domain findings: the seed permanently writes plaintext into value-layer-protected columns (the one-shot migration early-returns for seeded users, so it never self-heals), the anonymiser regenerates slugs while keeping ciphertext (breaking GCM AAD so anonymised copies fail every protected-column decrypt), reimport backups write decrypted descriptions to plaintext CSVs on disk, account creation and budget-config writes are not atomic, and the seed wipe misses four tables. Several scripts are dead or point at stale paths.

## What Changes

- Seed: unlock the keyring in the seed process and route all fixture writes through the encrypt helpers; existing seeded users get value-layer encryption on re-seed
- Seed `wipe`: also clears `account_notes`, `monthly_reviews`, `expenses_history`, `spending_categories`; seed connection enables `foreign_keys`
- Anonymiser: skip slug regeneration for rows whose protected columns hold `v1|` ciphertext (AAD preserved); add a `v1|`-row test
- Reimport backups: encrypt backup CSVs with the user's DataKey (AES-256-GCM, versioned format); decryption at restore; documented retention
- Account + opening-balance and budget `writeWithTrail` writes wrapped in single transactions
- `updateTransaction` made userId-required (no latent plaintext branch)
- **Requires schema approval (DB locked)**: `uniqueIndex` on budget `(user_id, month)` + `monthly_reviews (user_id, year_month)` with conflict handling; drop redundant `idx_snapshots_slug`
- Scripts: delete `migrate-slugs.ts` + `create-test-accounts.ts` (dead/broken); `query-plan.ts` + `db-doctor.ts` use real path resolution + cipher-capable driver with key handling; `reset.ts` gains anonymise-style live-path guard; seed inserts drop bogus keys (`userId` on notes, `category: null`)
- AGENTS.md logger rule corrected (real path `src/lib/server/logger.ts`; `console.*` blessed for `scripts/`)

## Capabilities

### New Capabilities

- `data-layer-integrity` — encrypted-at-rest guarantees for seeded/backed-up/anonymised data, atomic multi-write invariants, and script/path correctness

### Modified Capabilities

- `envelope-encryption` — value-layer requirement extended to cover seed, backup, and anonymisation paths (no tool may write or break protected columns incorrectly)
