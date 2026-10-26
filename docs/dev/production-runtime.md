# Production runtime & deploy runbook

Applies to the adapter-node production deployment (`ofd-production` clone running a `release/*` branch).

## Startup entry: `server.js` (not `build/index.js`)

`@sveltejs/adapter-node` **never reads `.env`**. It reads `ORIGIN` / `HOST` / `PORT` from the **process env** at boot. The app's own `dotenv/config` imports (db client) run too late for the adapter's module-level consts.

`server.js` at the repo root fixes this — loads `.env` first, then imports the build:

```js
import "dotenv/config";
await import("./build/index.js");
```

## The ORIGIN pitfall (403: "Cross-site POST form submissions are forbidden")

If `ORIGIN` is absent from the process env, adapter-node defaults the request protocol to **`https`** (`handler.js` `get_origin()` fallback). The server then computes `https://localhost:3000` as its own origin while the browser sends `Origin: http://localhost:3000` → SvelteKit's CSRF check rejects **every** form POST with 403 — `localhost` vs `127.0.0.1` makes no difference.

**Fix:** `.env` must contain `ORIGIN=http://localhost:3000` and the app must be started via `node server.js` / `pm2 start server.js`. (Equivalent alternative: pass `ORIGIN=…` explicitly in the PM2 process env — `pm2 save` persists it — but then `.env`'s `ORIGIN` stays misleadingly dead.)

## PM2

```bash
pm2 start server.js --name ofd-production
pm2 save
```

`pm2 restart ofd-production` after redeploys. `pm2 save` persists the process (and its env) across reboots.

## Update procedure (per release)

```bash
cd ~/personal-coding/ofd-production
cp storage/prod.db storage/prod.db.pre-update-<version>
git pull origin release/vX.Y.Z
npm install
npm run build
pm2 restart ofd-production
pm2 logs ofd-production --lines 30
```

Rollback: `pm2 stop` → restore the `prod.db` backup → `git checkout release/v<prev>` → rebuild → start.

## Gotchas log

- **2026-10-26 (v1.1.0):** CSRF 403 on all form POSTs — ORIGIN missing from process env (see above); fixed by PM2 env vars, `server.js` shim added for future releases.
- **2026-10-26 (v1.1.0):** 404 on `POST /migrate` during keyring ceremony — form posted the default action while `+page.server.ts` defined only a named action `migrate`; fixed by `action="?/migrate"`. Audit of all routes found no other offenders (named-action pages must set `action=`/`formaction=` on every POST form).
- **2026-10-26 (v1.1.0):** App-wide 500s (`SQLITE_NOTADB` at boot) after a restart — **manual `.env` edit appended onto a file without trailing newline**, gluing a new variable onto the `ENCRYPTION_KEY` line and silently changing the key. Rule: never `>> .env` blind — check the file ends with a newline first (`tail -c1 .env`), or edit with a tool that guarantees line structure. Symptom signature: `SQLITE_NOTADB` on *every* boot path including the startup security check, while a known-good backup also "fails" — the key value itself is wrong, the DB is fine.
- WebAuthn (L2 device slots) additionally requires `WEBAUTHN_EXPECTED_ORIGINS=http://localhost:3000` in `.env` for non-development `APP_ENV` — ceremonies fail closed without it. Use `http://localhost:3000` only: credentials are bound to RP ID `localhost`, so `127.0.0.1` can never enroll/unlock.
- After any restart post-envelope-migration, the keyring boots **sealed** — log in, then the app routes to `/unlock` (password re-opens the keyring). This is by design, not a fault.
