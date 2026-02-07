# Version History

Log of work done on the Offline Finance Dashboard project.

---

## [2026-02-07 19:27] — Quick Task 002: Convert to Tailwind v4 with @theme and @utility

**Summary:** Refactored styling from vanilla CSS classes to proper Tailwind v4 patterns. Replaced CSS custom properties with @theme directive for custom colors (green-700, amber-700, red-700). Converted .bracket-link class to @utility directive. Replaced all vanilla CSS classes in components with Tailwind utility classes (border-black, p-2, flex, text-green-700, etc.). Updated documentation to reflect Tailwind v4 patterns.

**Files:**
- `src/app.css` (refactored - @theme directive, @utility bracket-link, removed vanilla CSS classes)
- `src/routes/+layout.svelte` (updated - replaced .terminal-container and .title-bar with utility classes)
- `src/routes/+page.svelte` (updated - all vanilla classes replaced with Tailwind utilities)
- `src/lib/components/navigation.svelte` (updated - uses Tailwind utility classes, keeps bracket-link @utility)
- `docs/design/terminal-aesthetic.md` (updated - Tailwind v4 @theme and @utility documentation)

**Commit:**
```
feat(quick-002): convert to Tailwind v4 with @theme and @utility directives

- Replaced CSS custom properties with @theme directive for custom colors
- Converted .bracket-link to @utility directive for reusable pattern
- Replaced all vanilla CSS classes with Tailwind utility classes
- Updated documentation with Tailwind v4 patterns and examples
- Preserved terminal aesthetic with modern implementation
```

**Context:** Tailwind v4's @theme directive defines custom design tokens (colors, fonts, spacing) that become available as utility classes (text-green-700, font-terminal). @utility directive creates reusable patterns like bracket-link with hover effects. All component styling now uses utility classes directly (border-black, p-2, flex) instead of custom CSS classes. Table base styles kept using @apply directive for global application. Terminal aesthetic unchanged - only implementation modernized.

---

## [2026-02-07 19:18] — Quick Task 001: Convert styling to match mockup terminal design

**Summary:** Converted application styling from modern Tailwind UI to terminal/research-paper aesthetic matching the mockup-v2-favourite.html design. Implemented monospace fonts, bordered layouts, bracket-style navigation links, high-contrast colors, and removed dark mode in favor of light-only terminal theme.

**Files:**
- `src/app.css` (completely rewritten - terminal theme CSS variables and utility classes)
- `src/routes/+layout.svelte` (updated - terminal container wrapper with title bar)
- `src/lib/components/navigation.svelte` (completely rewritten - bracket-style nav links)
- `src/routes/+page.svelte` (completely rewritten - terminal-styled net worth display)
- `src/app.html` (updated - removed dark mode script)
- `docs/design/terminal-aesthetic.md` (created - design system guide)
- `CLAUDE.md` (updated - added design system adherence rules)

**Commit:**
```
feat(quick-001): convert styling to terminal aesthetic matching mockup design

- Replaced research-paper CSS with terminal theme (monospace, borders, brackets)
- Added terminal utility classes: .terminal-container, .section, .header, .row, .bracket-link, .nav-footer, .title-bar
- Implemented title bar with app name and username display
- Navigation now uses bracket-style links: [Home] [Accounts] [Snapshots] [Settings] [Exit]
- Home page displays net worth prominently with up/down indicator and status colors
- Removed dark mode - terminal aesthetic is light-only
- Created design system guide at docs/design/terminal-aesthetic.md
- Added CLAUDE.md reminder for ongoing design adherence
```

**Context:** Terminal aesthetic uses monospace Courier New font, 1px black borders on white background, bracket-style navigation links with hover inversion, and semantic status colors (green/amber/red). Layout matches mockup-v2-favourite.html with title bar, net worth section, assets/liabilities summary, savings goals placeholder, and accounts overview table. All new UI work should follow docs/design/terminal-aesthetic.md guidelines.

---

## [2026-02-07 18:30] — UI Framework Upgrade: Tailwind 4, Svelte 5, Vite 6

**Summary:** Upgraded to latest UI framework stack: Tailwind CSS 4.0 (CSS-based config), Svelte 5.47 (Runes syntax), Vite 6.1.0, SvelteKit 2.50.0. Added modern UI component library with bits-ui, layerchart, lucide-svelte. Implemented dark mode toggle and research-paper aesthetic base styles.

**Dependencies Added:**
- `bits-ui`: Headless UI primitives for Svelte
- `layerchart`: Data visualization components  
- `layercake`: Framework-agnostic charting
- `lucide-svelte`: Icon library
- `@tanstack/svelte-table`: Table components
- `sveltekit-superforms`: Form handling with Valibot
- `valibot`: Schema validation
- `tailwind-merge`: Merge Tailwind classes
- `clsx`: Conditional className utility

**Files Created:**
- `postcss.config.js` - PostCSS config for Tailwind 4
- `src/app.css` - Main stylesheet with Tailwind 4 imports and research-paper styles
- `src/lib/utils.ts` - `cn()` utility for merging Tailwind classes
- `src/lib/components/navigation.svelte` - Site navigation with dark mode toggle
- `src/lib/components/theme-toggle.svelte` - Dark/light mode switcher
- `src/lib/components/ui/button/button.svelte` - Button component (bits-ui wrapper)
- `src/lib/components/ui/input/input.svelte` - Input component
- `src/lib/components/ui/card/card.svelte` - Card component
- `src/lib/components/ui/index.ts` - UI component exports
- `src/routes/+layout.svelte` - Root layout with navigation
- `src/routes/+layout.server.ts` - Server layout loading user data

**Files Updated:**
- `svelte.config.js` - Changed adapter from `adapter-auto` to `adapter-node`
- `src/routes/+layout.ts` - Added app.css import
- `src/routes/+page.svelte` - Redesigned home page with research-paper aesthetic
- `src/app.html` - Added dark mode script, SVG favicon
- `CLAUDE.md` - Added rule #9: package.json locked

**Commit:**
```
feat(ui): upgrade to Tailwind 4, Svelte 5, and modern component library

- Tailwind CSS 4.0 with CSS-based configuration
- Svelte 5.47 with Runes syntax
- Vite 6.1.0 and SvelteKit 2.50.0
- Added bits-ui, layerchart, lucide-svelte components
- Created research-paper aesthetic base styles
- Implemented dark mode toggle with localStorage persistence
- Updated navigation with user-aware menu
- Created cn() utility for merging Tailwind classes
```

**Context:** This upgrade prepares the application for Phase 2 (Accounts & Balances) with a modern, accessible UI framework. The research-paper aesthetic aligns with the project's goal of data density and seriousness. Dark mode support respects user preferences and system settings.

---

## [2026-02-07 18:08] — Phase 1: Secure Foundation — COMPLETE

**Summary:** Phase 1 execution complete with all 4 plans implemented and verified. Users can now register with TOTP MFA, log in with rate limiting, and have complete data isolation between users. Database is encrypted at rest with SQLCipher. Verification passed 5/5 must-haves.

**Phase Summary:**
- Plan 01-01: SvelteKit project with encrypted SQLite, Drizzle ORM, auth utilities
- Plan 01-02: User registration with Argon2id hashing and TOTP MFA setup
- Plan 01-03: Login flow with rate limiting and HTTP-only session cookies
- Plan 01-04: Multi-user row-level security with unit tests

**Verification Results:** 5/5 must-haves passed
1. ✓ User registration with TOTP MFA (complete flow with QR code)
2. ✓ HTTP-only session persistence (24-hour cookies)
3. ✓ Logout functionality (clears session and cookie)
4. ✓ Multi-user data isolation (row-level security utilities)
5. ✓ Database encryption at rest (SQLCipher AES-256-CBC)

**Files Modified:**
- `.planning/ROADMAP.md` (updated - Phase 1 marked complete)
- `.planning/STATE.md` (updated - position advanced to Phase 2)
- `.planning/phases/01-secure-foundation/01-secure-foundation-VERIFICATION.md` (created)

**Commit:**
```
feat(phase-01): complete secure foundation with authentication and multi-user support

Phase 1 complete - all 4 plans executed and verified:
- SvelteKit project with encrypted SQLite (SQLCipher)
- User registration with TOTP MFA (QR code, backup codes)
- Login flow with rate limiting (exponential backoff)
- Multi-user row-level security (user_id filtering)
- Verification passed 5/5 must-haves

Next: Phase 2 (Accounts & Balances)
```

**Context:** Total execution time: 56 minutes across 4 waves. Average plan duration: 14 minutes. Security foundation complete with Argon2id password hashing, TOTP MFA with AES-256-GCM encryption, database-backed rate limiting, and row-level security for multi-user data isolation.

---

## [2026-02-07 18:03] — Plan 01-04: Multi-user row-level security

**Summary:** Implemented row-level security utilities for enforcing user data isolation, multi-user demo page showing security in action, and unit tests verifying isolation logic. All database queries must filter by user_id from session, preventing cross-user data access even if URLs or IDs are guessed.

**Files:**
- `src/lib/auth/row-security.ts` (created - withUserFilter, validateUserAccess, checkUserAccess, validateAllUserAccess, andWithUserFilter utilities)
- `src/routes/app/+page.svelte` (updated - shows multi-user security info and phase 1 completion status)
- `src/routes/app/users/+page.svelte` (created - multi-user security demo page)
- `tests/unit/row-security.test.ts` (created - unit tests for row-level security)
- `vitest.config.ts` (created - vitest configuration)
- `package.json` (updated - added vitest dev dependency and test scripts)

**Commit:**
```
feat(phase-01-04): implement multi-user row-level security

- Row-level security utilities (withUserFilter, validateUserAccess, checkUserAccess, validateAllUserAccess)
- Multi-user demo page at /app/users
- Updated /app page to show multi-user security info
- Unit tests for row-level security with vitest
- All database queries must filter by user_id from session
- Generic errors for access denied (no data leakage)
```

**Context:** Row-level security ensures users can only access their own data. The withUserFilter() function adds eq(table.userId, userId) to queries. validateUserAccess() throws 403 if resource.userId !== user.id. checkUserAccess() returns boolean for conditional access. validateAllUserAccess() validates arrays of resources. andWithUserFilter() combines user filter with additional conditions. Demo pages show current user info and explain how isolation works.

---

## [2026-02-07 18:15] — Plan 01-03: Login flow with rate limiting

**Summary:** Implemented login authentication flow with username/password validation, TOTP code verification, database-backed exponential backoff rate limiting (5 failed attempts = 15-minute lockout), HTTP-only session cookie creation, and logout handler that clears session. All authentication failures return generic "Invalid credentials" message to prevent username enumeration.

**Files:**
- `src/lib/security/rate-limiter.ts` (created - database-backed rate limiting with exponential backoff)
- `src/routes/(auth)/login/+page.svelte` (created - login form with username, password, TOTP fields, delay countdown)
- `src/routes/(auth)/login/+page.server.ts` (created - login handler with password verification, TOTP verification, rate limiting, session creation)
- `src/routes/logout/+page.server.ts` (created - logout handler that clears session and cookie)
- `src/routes/app/+page.svelte` (created - protected page showing user info and logout button)

**Commit:**
```
feat(phase-01-03): implement login flow with rate limiting and session management

- Login form with username, password, and TOTP code fields
- Database-backed exponential backoff rate limiting (2^count seconds)
- Account lockout after 5 failed attempts (15-minute duration)
- Generic error messages to prevent username enumeration
- HTTP-only session cookie with 24-hour maxAge
- Single session per user (new login invalidates existing sessions)
- Logout handler that clears session from database and cookie
- Protected /app route showing user and session info
```

**Context:** Login flow uses database fields (failedLoginAttempts, lockedUntil) for persistent rate limiting across server restarts. Exponential backoff: 1s, 2s, 4s, 8s, 16s capped at 30s. Account locked for 15 minutes after 5 failed attempts. Sessions stored as opaque 32-byte hex tokens. All auth failures return "Invalid credentials" regardless of which credential was wrong. TOTP secret decrypted using ENCRYPTION_KEY before verification.

---

## [2026-02-07 17:53] — Plan 01-02: User registration with TOTP MFA

**Summary:** Implemented user registration flow with username/password form using Argon2id hashing, redirect to MFA setup page with QR code for authenticator app scanning, TOTP code verification, and backup codes generation and display. TOTP secrets are encrypted with AES-256-GCM using the system ENCRYPTION_KEY before storage. Backup codes are hashed with Argon2id before database storage.

**Files:**
- `src/routes/(auth)/+layout.svelte` (created - shared auth layout)
- `src/routes/(auth)/register/+page.svelte` (created - registration form UI)
- `src/routes/(auth)/register/+page.server.ts` (created - registration handler with validation, password hashing, TOTP secret generation and encryption)
- `src/routes/(auth)/mfa-setup/+page.svelte` (created - MFA setup page with QR code and backup codes display)
- `src/routes/(auth)/mfa-setup/+page.server.ts` (created - MFA verification handler)
- `src/lib/auth/mfa.ts` (updated - added decryptTOTPSecret function)

**Commit:**
```
feat(phase-01-02): implement user registration with TOTP MFA

- Registration form with username/password validation
- MFA setup page with QR code generation
- TOTP verification with 1-window tolerance
- Backup codes generation and storage (hashed with Argon2id)
- TOTP secrets encrypted with AES-256-GCM
- 15-minute cookie timeout for MFA setup completion
```

**Context:** Users register with username/password, then are redirected to /mfa-setup to complete TOTP configuration. Registration handler validates username (3-50 chars, alphanumeric/underscore/hyphen), password (min 12 chars), checks availability, generates TOTP secret, encrypts with AES-256-GCM, and creates user record. MFA setup handler decrypts TOTP secret, generates QR code, verifies TOTP code, stores 10 hashed backup codes. Generic error messages for security.

---

## [2025-02-07 17:51] — Plan 01-01: SvelteKit project initialized with encrypted database

**Summary:** Initialized SvelteKit 2.x project with TypeScript, encrypted SQLite database using SQLCipher (via better-sqlite3-multiple-ciphers), Drizzle ORM for type-safe queries, authentication utilities (Argon2id password hashing via @node-rs/argon2, TOTP MFA generation/verification via otplib and qrcode, AES-256-GCM encryption), and server hooks foundation.

**Files:**
- `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json` (created)
- `.env.example` (created with ENCRYPTION_KEY placeholder)
- `drizzle.config.ts` (created for Drizzle Kit migrations)
- `src/lib/db/schema.ts` (created with users, sessions, backupCodes tables)
- `src/lib/db/client.ts` (created with SQLCipher encryption pragmas)
- `src/lib/auth/password.ts` (created with Argon2id hashing utilities)
- `src/lib/auth/mfa.ts` (created with TOTP generation and verification)
- `src/lib/auth/encryption.ts` (created with PBKDF2 key derivation and AES-256-GCM)
- `src/hooks.server.ts` (created with session validation foundation)
- `src/app.d.ts` (updated with TypeScript locals augmentation)
- `src/app.html`, `src/routes/+layout.ts`, `src/routes/+page.svelte` (created)
- `src/service-worker.ts`, `src/service-worker.d.ts` (created)
- `storage/.gitkeep` (created)

**Commit:**
```
feat(phase-01-01): initialize SvelteKit with encrypted SQLite database and auth utilities
```

**Context:** SvelteKit 2.x project structure created with SSR-only mode. Database encryption uses AES-256-CBC via better-sqlite3-multiple-ciphers with ENCRYPTION_KEY env var. Drizzle schema includes users (with TOTP secret encryption), sessions (24-hour inactivity timeout), and backupCodes tables. Auth utilities: Argon2id with OWASP parameters (memoryCost: 65536, timeCost: 3), otplib for TOTP, Node.js crypto.pbkdf2Sync for user key derivation.

---

## [2025-02-07 17:15] — Phase 1 planning complete

**Summary:** Planned Phase 1 (Secure Foundation) with 4 executable plans covering SvelteKit setup, encrypted SQLite database, user registration with TOTP MFA, login flow with rate limiting, and multi-user row-level security. Research completed; plans verified after 2 revision iterations.

**Files:**
- `.planning/phases/01-secure-foundation/01-RESEARCH.md` (created)
- `.planning/phases/01-secure-foundation/01-01-PLAN.md` (created)
- `.planning/phases/01-secure-foundation/01-02-PLAN.md` (created)
- `.planning/phases/01-secure-foundation/01-03-PLAN.md` (created)
- `.planning/phases/01-secure-foundation/01-04-PLAN.md` (created)
- `.planning/ROADMAP.md` (updated)
- `.planning/STATE.md` (updated)

**Commit:**
```
feat(phase-01): plan secure foundation with 4 waves
```

**Context:** Research covered SvelteKit patterns, better-sqlite3-multiple-ciphers encryption, @node-rs/argon2 hashing, otplib TOTP. Plans: 01-01 SvelteKit setup, 01-02 user registration with MFA, 01-03 login with rate limiting, 01-04 multi-user row-level security.

---

## [2025-02-07 16:45] — Project initialization

**Summary:** Initialized GSD project with questioning, research, requirements, and roadmap. Configured git safety rails (.gitignore, git-add-excluded.sh) for sensitive data exclusions. Gathered Phase 1 context.

**Files:**
- `.planning/PROJECT.md`, `.planning/config.json`, `.planning/REQUIREMENTS.md` (created)
- `.planning/ROADMAP.md`, `.planning/STATE.md` (created)
- `.planning/research/*` (5 files created)
- `.planning/phases/01-secure-foundation/01-CONTEXT.md` (created)
- `.gitignore`, `git-add-excluded.sh` (created, chmod +x)
- `CLAUDE.md`, `VERSION_HISTORY.md` (updated)

**Commit:**
```
feat: initialize offline finance dashboard project
```

**Context:** GSD project setup with 6-phase roadmap (48 requirements). Research complete: stack, features, architecture, pitfalls. .gitignore configured for sensitive data exclusion. Phase 1 context gathered.

---
