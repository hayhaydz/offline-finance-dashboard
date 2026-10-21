# Reimport Backups: Encryption, Retention, Replacement

Authoritative semantics for the "before" CSV backups written by the reimport
engine (`src/lib/server/imports-update.ts`). The reimport safety chain is
preview → backup → atomic commit; this document is the contract for step 2.

## Encryption at rest

Backup files are **ciphertext on disk**. When `commitReimport` touches rows
(edits + deletes), it first writes the pre-state of every touched row to

```
storage/backups/user-<id>/backup-<epoch-millis>-<nanoid8>.csv
```

The file *contents* are the CSV bytes sealed with the user's DataKey using
the value-layer codec (`v1|<iv>|<ciphertext>|<tag>`, AES-256-GCM) — the same
format as protected columns. No plaintext descriptions exist on disk.

- **AAD binding**: `backup|user-<id>|<filename>` — a backup ciphertext moved
  between users or renamed files fails GCM authentication.
- **Key**: the per-user DataKey, via the unlocked keyring. Backup writes and
  decrypts are only possible in an unlocked session (data-bearing routes are
  unlock-gated).
- **Legacy files**: backups written before encryption shipped are plaintext
  CSV on disk; `readBackupFile` passes non-`v1|` content through unchanged so
  old restores keep working.

## Reading / restoring

- **Download** — `GET /api/transactions/backup?file=<filename>` decrypts and
  serves the CSV (owner-scoped; filename pattern-validated).
- **Restore** — reimport the downloaded file in **recovery mode** (upsert by
  `id`): restores edited values and reinserts deleted rows with their
  original ids.

## Retention / replacement

- Each reimport run that touches rows writes **one new timestamped file**;
  files are never overwritten or updated in place (the nanoid suffix makes
  collisions impossible).
- There is **no automatic pruning**: every run's pre-state is kept until the
  user deletes files under `storage/backups/user-<id>/` manually.
- A run that changes nothing (`skipped` only) writes no backup.
- Restoring does not consume the backup — the same file can be re-imported
  repeatedly (idempotent: a second restore of the same state skips).

## Operator notes

`IMPORT_BACKUP_DIR` (env) overrides the backup root (tests use it). Wiping
the directory only loses restore points — live data is untouched.
