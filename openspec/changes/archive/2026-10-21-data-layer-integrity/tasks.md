# Tasks: data-layer-integrity

## 1. Seed encryption (major)

- [x] 1.1 `scripts/seed/lib/user.ts`: after slot enrollment, `unlockKeyring(userId, dataKey)` so encrypt helpers work in-process; seal at seed exit
- [x] 1.2 Route all fixture writes through `encryptTxDescription`/`encryptNoteContent`/`encryptReviewNotes` in `standard.ts`, `edge.ts`, `stress.ts`
- [x] 1.3 For an EXISTING seeded user (re-seed): unwrap with the dev password, then re-write protected values encrypted (or wipe+recreate — pick simpler)
- [x] 1.4 Verification: fresh seeded DB has 0 plaintext protected values (re-run the at-rest audit script shape as a test)

## 2. Anonymiser AAD safety (major)

- [x] 2.1 `anonymise.ts`: skip slug regeneration when a row's protected column holds a `v1|` value (accountTransactions, monthlyReviews)
- [x] 2.2 Test: anonymised copy with an encrypted row decrypts that row successfully post-copy

## 3. Backup encryption (major)

- [x] 3.1 `imports-update.ts` `writeBackup`: encrypt CSV bytes AES-256-GCM under DataKey, format `v1|iv|ct|tag`, AAD `backup|user-<id>|<filename>`; restore path decrypts
- [x] 3.2 Document retention/replacement semantics in docs/transactions (or appropriate topic folder)
- [x] 3.3 Test: backup file on disk is not plaintext; restore round-trips

## 4. Atomic writes

- [x] 4.1 `accounts/create`: account + opening balance in one `db.transaction` + failure test
- [x] 4.2 `budgets.ts` `writeWithTrail`: config write + amendment insert in one transaction + test
- [x] 4.3 `transactions.ts` `updateTransaction`: `userId` required (remove plaintext fallback); delete if still dead code

## 5. Schema (🔒 APPROVAL REQUIRED — DB locked)

- [x] 5.1 Dedupe existing duplicate `monthly_reviews` (user, month) rows (keep latest) before index
- [x] 5.2 `budget_months (user_id, month)` + `monthly_reviews (user_id, year_month)` → `uniqueIndex`; `ensureCurrentMonth`/`getOrCreateReview` conflict handling (`onConflictDoNothing` + re-read)
- [x] 5.3 Drop redundant `idx_snapshots_slug` (slug already unique)
- [x] 5.4 Update `scripts/seed.ts` immediately per AGENTS.md DB rule

## 6. Seed wipe + script hygiene

- [x] 6.1 `wipe.ts`: add `account_notes`, `monthly_reviews`, `expenses_history`, `spending_categories`; fix completion log line
- [x] 6.2 `seed/lib/db.ts`: `pragma("foreign_keys = ON")`
- [x] 6.3 Seed inserts: drop bogus keys (`userId` on accountNotes, `category: null` → `categoryId` where intended); fix `npm run db:migrate` mention → real script
- [x] 6.4 Delete `scripts/migrate-slugs.ts`, `scripts/create-test-accounts.ts`
- [x] 6.5 `query-plan.ts` + `db-doctor.ts`: real path resolution (dev-plain/dev-encrypted per ENCRYPTION_KEY), cipher driver with key, friendly error when key missing
- [x] 6.6 `reset.ts`: anonymise-style live-path guard before unlink of non-default paths
- [x] 6.7 AGENTS.md: logger path corrected to `src/lib/server/logger.ts`; `console.*` explicitly allowed in `scripts/`

## 7. Verification

- [x] 7.1 `npm run check` + `npx vitest run` green
- [x] 7.2 VERSION_HISTORY entry
