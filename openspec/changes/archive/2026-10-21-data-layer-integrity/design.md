# Design: data-layer-integrity

## Context

Audit data-domain majors 1–5 + minors 6–15. The value-layer codec is wired correctly for app writes; these findings are about the TOOLING paths (seed/anonymise/backup) and multi-write atomicity.

## Goals / Non-Goals

**Goals:**
- Every path that persists protected-column data either encrypts it or preserves its ciphertext intact
- No partial multi-row writes reachable from user actions
- Scripts that ship are runnable against the real DB layout

**Non-Goals:**
- Changing the value-layer format or AAD scheme
- Migrating legacy plaintext rows (existing dev data) — covered implicitly by re-seed, not by a runtime backfill
- Backup file UI/UX changes beyond encryption

## Decisions

1. **Seed encrypts for real.** `ensureAdminUser` already has the DataKey (returns it via `enrollPasswordSlot`-adjacent flow); call `unlockKeyring(userId, dataKey)` in the seed process before fixture writes, then route descriptions/notes/reviews through the encrypt helpers. SealedError guard: encrypt helpers throw when sealed — unlock first, seal at exit.
2. **Anonymiser: preserve AAD.** For rows whose protected column starts `v1|`, keep the original slug (skip slug regen) — anonymisation of the ciphertext-bearing row is limited to non-AAD columns. Simpler and safer than decrypt-reencrypt under a seeded key.
3. **Backups encrypted under the DataKey.** `writeBackup` produces `v1|<iv>|<ct>|<tag>` files (same codec, AAD = `backup|user-<id>|<filename>`); restore path decrypts with the unlocked keyring (restore is already unlock-gated). Retention documented: files live under `storage/backups/user-<id>/` and are replaced per reimport run.
4. **Unique indexes (needs approval — DB locked).** `budget_months (user_id, month)` and `monthly_reviews (user_id, year_month)` become unique with `onConflictDoNothing`-style handling in `ensureCurrentMonth`/`getOrCreateReview`; matches income/expenses history tables. Duplicate `idx_snapshots_slug` dropped.
5. **Delete over repair** for dead scripts (migrate-slugs, create-test-accounts): both target a path the app never creates; repair would revive unmaintained surface.

## Risks / Trade-offs

- Unique-index migration can fail if duplicates already exist (seed wipe bug created review dupes) — wipe fix + dedupe step runs before index creation; apply order documented in tasks.
- Encrypted backups are no longer human-readable CSV — acceptable; the restore path is the consumer.
