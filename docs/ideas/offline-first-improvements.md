# Offline-First Improvement Ideas

Status: proposals only — nothing below is implemented. All ideas preserve the
project philosophy: manual truth, terminal aesthetic, zero cloud, local disk
as the single source of truth.

## The user's open question: full browser-side data encapsulation?

The question was asked whether the app could go further and become a fully
browser-encapsulated client-side service (IndexedDB/sql.js-WASM, no Node
server). Analysis:

### What we'd gain

- **Zero install**: open a static URL, no `npm run start`. The "server" is the
  browser's own storage.
- **True portability**: the whole app becomes a folder of static files that
  can run from `file://` or any dumb static host.
- **No localhost attack surface at all**: no TCP listener, no session cookie
  theft via local processes, nothing to port-scan.

### What we'd lose (the compromises)

1. **SQLCipher at-rest encryption.** The current threat model — "data at rest
   on disk is AES-encrypted; lose the key, lose the data" — cannot be
   replicated. IndexedDB has no at-rest encryption; any user profile access
   reads the data. OPFS + sql.js keeps a plaintext WASM heap. WebCrypto can
   encrypt a serialized export, but the decrypted key must live in memory and
   the DB page cache is plaintext while running.
2. **Argon2id + OWASP password hashing.** WebCrypto has no Argon2. A WASM
   Argon2 with 64MB memory cost runs but is slower and easier to side-channel
   on a shared machine. Auth would degrade to a passphrase-derived AES-GCM
   key (PBKDF2/scrypt-via-WASM) — weaker than the current setup.
3. **Single-source-of-truth backups.** Today: one `prod.db` file, copy it and
   you have a complete encrypted backup. Browser storage is ephemeral,
   quota-limited, and wiped by "clear site data" — the classic PWA data-loss
   trap. We'd need a disciplined export/import file discipline (see idea #1).
4. **Winston audit logs.** File-based, sanitized, rotated logs disappear;
   debugging becomes `console` only.
5. **Multi-user RLS.** The user_id row-security model evaporates — a
  browser profile IS the user. Fine for single-user, but it changes the data
   model.

### Verdict

The current architecture (local Node process + SQLCipher + Argon2id) is the
*stronger* security posture; full browser encapsulation trades real security
for install convenience. If ever attempted, do it as a **separate export
target** ("read-only snapshot in the browser" via a signed static bundle),
not a replacement. The rest of this document assumes the server stays.

## Improvement ideas (ranked, philosophy-compatible)

1. **Encrypted portable snapshot export.** One click in Settings → Data:
   dumps all tables to a single `.json` envelope encrypted with AES-256-GCM
   under a user-supplied passphrase (scrypt-derived). Gives the browser-only
   crowd an escape hatch and everyone else a proper backup story. Complements
   the raw `.db` copy without requiring the encryption key juggling.

2. **Login redirect preservation.** `hooks.server.ts` currently drops the
   original destination on session expiry (`redirect(302, /login)`). Append
   `?redirectTo=` and honour it after successful login — small QoL win for
   the 5-minute inactivity timer.

3. **Offline-aware UI state.** Now that the service worker shows a proper
   offline page, the client could also detect `navigator.onLine === false`
   transitions and render a passive `[!] OFFLINE — CHANGES QUEUED [!]` style
   banner in the top bar. Note: form actions cannot be queued without a
   client-side store, so scope this to display-only.

4. **Goal pace lines.** Goals already show progress; add an "on-pace" tick
   (linear expected progress between creation and target date, like the ISA
   pacing widget). Reuses existing `isaPacing` logic per-goal.

5. **Snapshot diff view.** Snapshots freeze net worth; a side-by-side
   comparison of two snapshots (assets/liabilities by type, ISA usage, PSA)
   is pure derivation from stored snapshot JSON — no schema change.

6. **CSV template discovery.** `/templates/*.csv` exist but are only linked
   from the import wizard. Surface them on empty-account states.

7. **Audit log page.** The Winston logs already record mutations
   (`logInfo` on transactions/imports). A Settings → Security view that
   tails the last N audit events (read server-side) would make the
   "manual truth" philosophy visible and verifiable.

8. **Rate-limit feedback in the login form.** The action already returns
   `delay` ms on 429; the login page could render a live countdown instead
   of the static error string.

## Things deliberately NOT proposed

- Bank aggregation / open-banking APIs — violates "manual truth" ethos.
- Cloud sync of any kind — violates offline-first isolation.
- Electron/Tauri packaging — adds update channels and binary trust issues
  for little gain over `npm run start`.
