## 🚫 GIT OPERATIONS (MANUAL ONLY)

**CRITICAL:** Git operations (`git add`, `git commit`, `git push`) are **HANDLED MANUALLY** by the developer.

- **DO NOT** run `git add`, `git commit`, or `git push` commands
- **DO NOT** suggest running these commands
- **DO NOT** create commits or push changes
- The developer uses a custom `git-add-excluded.sh` script to stage files with proper exclusions
- History has been cleaned with `git-filter-repo` to remove excluded paths

**Excluded from git:**
- `logs/`, `.env*`, `venv/`, `storage/`, `storage-dev/`, `test-storage/`
- `.ruff_cache/`, `.pytest_cache/`, `__pycache__/`, `*.pyc`
- `.benchmarks/`, `beamng_cortex.egg-info`, `.serena/`, `.claude/`

---

## 📝 VERSION HISTORY LOG

Instead of automated git operations, record work at **save points** to `VERSION_HISTORY.md`.

**When to write a log entry:**
- After completing a meaningful unit of work (feature, fix, refactor)
- At natural checkpoints (end of phase, after testing, before context switch)
- When you would have otherwise created a git commit

**Entry format:**

```markdown
## [YYYY-MM-DD HH:MM] — [Brief Description]

**Summary:** [1-2 sentences about what was done]

**Files:**
- [list key files modified/created]

**Commit:**
```
[type](scope): one-line description
```

**Context:** [Additional details for context]

---
```

**Log location:** `VERSION_HISTORY.md` (most recent entry at top)

---

## 📁 DOCUMENTATION ORGANIZATION

**General project documentation** (non-GSD) goes in `docs/`:

- Organize by topic/category with descriptive folder names
- Use markdown files (`.md`) for documentation
- Keep docs/ folder structure clean and logical

---

## 🎨 DESIGN SYSTEM ADHERENCE

**CRITICAL:** This application uses a **Terminal/Research-Paper Aesthetic**.

**When modifying or creating UI components:**
1. **ALWAYS** use existing CSS classes from `src/app.css` (terminal theme)
2. **DO NOT** introduce new color schemes or dark mode variants
3. **USE** monospace fonts (Courier New) for terminal aesthetic
4. **USE** bracket-style navigation links: `[Home]` `[Accounts]` etc.
5. **USE** bordered sections with high contrast (black borders on white)
6. **USE** status colors: `.green`, `.amber`, `.red` only for semantic meaning
7. **KEEP** dense layout with minimal padding (4px/8px)
8. **NO** rounded corners, shadows, gradients, or modern UI patterns

**Reference:** `docs/design/terminal-aesthetic.md` for complete design system guide.

---

## 🔒 SECURITY STANDARDS

**CRITICAL:** This is a financial application. Security is the highest priority.

**Mandatory Development Rules:**
1. **ROW-LEVEL SECURITY:** Every database query MUST include `withUserFilter(locals.user.id, table)`.
2. **DATA SANITIZATION:** Never return raw database rows from the `users` table to the client. Use sanitized DTOs.
3. **OFFLINE-FIRST CONTEXT:** The Node.js server (WSL2) is the "Trusted" zone; the Browser (Windows) is the "Untrusted" zone. All security logic (hashing, encryption, auth checks) occurs on the server.
4. **CSP:** Do not modify `kit.csp` in `svelte.config.js` without a security review.

**Reference:** `docs/security/DEVELOPMENT_GUIDELINES.md` for full security implementation guide.

---

## 🔗 URL SLUGS

**CRITICAL:** Dynamic routes MUST NOT use database IDs (auto-increment integers, UUIDs, or sequential identifiers) in URLs.

**Why Database IDs in URLs Are Problematic:**
- Expose internal database structure
- Are guessable (sequential integers leak creation order/volume)
- Create poor user experience (meaningless identifiers)
- Enable enumeration attacks
- Cannot be changed without breaking links/bookmarks

**MANDATORY URL SLUG RULES:**

1. **Use Nanoids for Entity Identifiers**
   - Add `slug` column (TEXT, unique, indexed) to relevant tables
   - Generate on entity creation using nanoid library (URL-safe alphabet)
   - Use nanoid length of 16-21 characters (collision-resistant like UUID)
   - Example slug: `aB3xK9mN2pQ4rS6t`

2. **URL Pattern**
   - ❌ WRONG: `/accounts/123`, `/accounts/123/balances/456/edit`
   - ✅ RIGHT: `/accounts/aB3xK9mN`, `/accounts/aB3xK9mN/balances/K9nM3pQ4/edit`

3. **Slug Generation Rules**
   - Generate on creation (never changes)
   - Must be unique within entity type
   - Must be indexed for performant lookups
   - Store in dedicated `slug` column (not derived from name)

4. **When to Use Slugs**
   - ALL user-facing dynamic routes
   - Account detail pages, balance entries, settings resources
   - Any route where users might share/bookmark URLs

5. **When Database IDs Are Acceptable**
   - Temporary/internal routes only
   - Server-side processing where URL is never user-visible
   - Redirect targets (final destination uses slug)

**Implementation Pattern (Drizzle ORM):**

```typescript
// Schema
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // NEW: URL-safe identifier
  // ... other fields
});

// Add index for slug lookup
// CREATE INDEX idx_accounts_slug ON accounts(slug);

// Generate on creation
import { nanoid } from 'nanoid';
const slug = nanoid(16); // e.g., "aB3xK9mN2pQ4rS6t"

// Route lookup
const account = await db.query.accounts.findFirst({
  where: eq(accounts.slug, params.slug)
});
```

**Reference:** See `docs/architecture/url-slugs.md` for detailed implementation guide.

---

## 📋 LOGGING SYSTEM

**CRITICAL:** This project uses a custom Winston-based logging system. ALL server-side logging MUST use the custom logger.

**Logger location:** `src/lib/utils/logger.ts`

**Mandatory Development Rules:**
1. **NEVER use `console.log()`** for server-side logging. Use `devLog()` instead.
2. **ALWAYS import from custom logger:** `import { devLog, logError, logFormData } from '$lib/utils/logger';`
3. **Server-side (`*.server.ts`) logs go to:**
   - Terminal console (brief output)
   - `./logs/application-YYYY-MM-DD.log` (detailed JSON)
   - `./logs/error-YYYY-MM-DD.log` (errors only)
4. **Client-side (`.svelte` components)** may use `console.log()` for browser DevTools.
5. **Production mode** suppresses dev logs and sanitizes error logs automatically.
6. **Sensitive data masking** is automatic for passwords, tokens, secrets, API keys.

**Logger API:**
- `devLog(category, message, data?)` - Development-only logging
- `logError(category, message, error?)` - Error logging (all environments)
- `logFormData(category, formData)` - Form data with automatic sensitive masking
- `logRequest(category, request)` - Request logging for debugging

**Reference:** `docs/setup/logging.md` for complete logging guide.

---

## 🔍 QA & VALIDATION

After completing a significant unit of work or phase:
1. **RUN TYPESCRIPT CHECKS:** Execute `npm run check` to ensure type safety and Svelte component integrity.
2. **RUN TEST SUITE:** Execute `npm test` (or `npm run test:run`) to verify no regressions in logic or security.
3. **VALIDATE UI:** Confirm adherence to the Terminal Aesthetic (monospace, borders, bracket-links).

---

## ABSOLUTE RULES (NON-NEGOTIABLE)

1. ONLY produce code diffs or full file replacements when explicitly instructed.
2. NEVER run or suggest running tests, CLI commands, scripts, or builds **EXCEPT** for final QA/validation as described above or as per primary mandate.
3. NEVER run `git add`, `git commit`, or `git push` — these are manual operations.
4. **AT SAVE POINTS, UPDATE `VERSION_HISTORY.md`** — record what was done and suggested commit message.
5. **GENERAL DOCUMENTATION goes in `docs/` folder** — organize by topic/category.
6. **🔒 PACKAGE.JSON LOCKED** — User has manually configured dependencies. DO NOT modify `package.json` without explicit permission.
7. **ALWAYS FOLLOW TERMINAL AESTHETIC** — use existing CSS classes, maintain bordered layout, monospace font, bracket links.
8. **📋 ALWAYS USE CUSTOM LOGGER SYSTEM** — Import from `$lib/utils/logger.ts`. NEVER use `console.log()` in server-side code (`*.server.ts` files).
