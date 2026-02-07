# Version History

Log of work done on the Offline Finance Dashboard project.

---

## [2026-02-07 21:18] — Feature: Auto-login After MFA Setup + Global Loading Indicator

**Summary:** MFA setup now automatically logs user in and redirects to /app upon completion instead of showing a link to login. Added global loading indicator component with terminal aesthetic (PROCESSING label with animated squares) and loading store using Svelte 5 runes. Loading indicator integrated into root layout.

**Files:**
- `src/routes/(auth)/mfa-setup/+page.server.ts` (updated - creates session and redirects after TOTP verification)
- `src/routes/(auth)/mfa-setup/+page.svelte` (cleaned - removed success message section)
- `src/lib/stores/loading.ts` (created - global loading state with Svelte 5 runes)
- `src/lib/components/ui/loading-indicator/loading-indicator.svelte` (created - terminal-styled loading component)
- `src/routes/+layout.svelte` (updated - includes loading indicator)

**Commit:**
```
feat(ux): auto-login after MFA setup and add global loading indicator

- MFA setup creates session and redirects to /app (no manual login needed)
- Added loading store with start/stop methods and message support
- Created LoadingIndicator component with terminal aesthetic
- Animated loading dots using CSS keyframes
- Integrated into root layout for global access
```

---

## [2026-02-07 21:12] — Fix: Rate Limiter Delay Bug

**Summary:** Fixed rate limiter bug where delay was calculated even on 0 failed attempts. The formula `2^count` was returning 1 second delay on first attempt (0 failed attempts). Now only applies delay when `failedLoginAttempts > 0`.

**Files:**
- `src/lib/security/rate-limiter.ts` (fixed - delay only when attempts > 0)

**Commit:**
```
fix(rate-limiter): don't apply delay on zero failed attempts

- Changed delay calculation to only apply when failedLoginAttempts > 0
- Previously: 0 attempts = 2^0 = 1 second delay (incorrect)
- Now: 0 attempts = undefined delay (correct)
```

---

## [2026-02-07 21:07] — Quick Task 005: Add Backup Code Login Support for MFA

**Summary:** Added backup code login functionality allowing users to recover account access when authenticator app is unavailable. Login form now accepts both 6-digit TOTP codes and 8-character backup codes. Backup codes are verified using Argon2id hashing (same params as passwords) and are immediately marked as used upon successful login. Case-insensitive input for user convenience.

**Files:**
- `src/lib/auth/mfa.ts` (updated - added verifyBackupCode function)
- `src/routes/(auth)/login/+page.server.ts` (updated - backup code verification flow)
- `src/routes/(auth)/login/+page.svelte` (updated - accepts both TOTP and backup codes)
- `src/lib/validation/rules.ts` (updated - added totpOrBackupCode rule)
- `tests/unit/mfa.test.ts` (updated - added backup code tests)
- `.planning/quick/005-add-backup-code-login-support-for-mfa/005-SUMMARY.md` (created - task summary)

**Commit:**
```
feat(quick-005): add backup code login support for MFA

- Added verifyBackupCode() function using Argon2id verification
- Login handler tries backup codes when TOTP fails
- Used codes are immediately marked as used and cannot be reused
- Case-insensitive input for UX convenience
- Generic error messages for both TOTP and backup code failures
- totpOrBackupCode() validation rule accepts 6-digit TOTP OR 8-character codes
- Unit tests for valid/invalid codes and case insensitivity
```

**Context:** Users who lose access to their authenticator app (lost phone, reset) can now use their backup codes to log in. The login flow attempts TOTP verification first, then falls back to backup codes. Backup codes are verified against hashed codes in database, and successful verification marks the code as used. Generic "Invalid credentials" error prevents probing which code type was attempted.

---

## [2026-02-07 21:00] — Fix: HTML Structure, Password Strength, Validation Timing

**Summary:** Fixed extra closing div tag in login page, added industry-standard strong password validation (uppercase, lowercase, number, special char, min 12), and fixed validation timing to only show errors after user has both blurred and typed something (dirty state).

**Files:**
- `src/routes/(auth)/login/+page.svelte` (fixed - removed extra closing div)
- `src/routes/(auth)/register/+page.svelte` (updated - uses strongPassword rules)
- `src/lib/validation/rules.ts` (added - hasUppercase, hasLowercase, hasNumber, hasSpecial, strongPassword)
- `src/lib/components/ui/form-field/form-field.svelte` (added - dirty state for timing control)

**Commit:**
```
fix(validation): add strong password rules and fix validation timing

- Industry-standard password: min 12 chars + uppercase + lowercase + number + special
- Added hasUppercase(), hasLowercase(), hasNumber(), hasSpecial() validators
- Added strongPassword() factory for combined password validation
- Validation errors now only show after user has typed (dirty state) + blurred (touched)
- Fixed extra closing </div> tag in login page
```

---

## [2026-02-07 20:54] — Fix: Form Styling and Reactivity

**Summary:** Fixed auth form styling to match terminal aesthetic (removed double borders, centered layout, bracket-link buttons) and fixed Svelte 5 reactivity warnings by making component refs reactive with $state().

**Files:**
- `src/routes/(auth)/login/+page.svelte` (updated - terminal styling, reactive component refs)
- `src/routes/(auth)/register/+page.svelte` (updated - terminal styling, reactive component refs)
- `src/routes/(auth)/mfa-setup/+page.svelte` (updated - terminal styling, reactive component refs)
- `src/lib/components/ui/form-field/form-field.svelte` (updated - tighter spacing, smaller text)

**Commit:**
```
fix(forms): match terminal aesthetic and fix svelte 5 reactivity warnings

- Removed outer bordered box (double borders issue)
- Forms now use border-b sections like rest of site
- Submit buttons use bracket-link style instead of black blocks
- Component refs declared with $state() for $effect tracking
- Tightened spacing (mb-1, text-xs) in FormField component
```

---

## [2026-02-07 20:10] — Fix: Otplib ESM Import

**Summary:** Fixed multiple import errors with otplib package. The package has changed to v12+ which no longer exports `authenticator`. Updated to use `TOTP` class with functional exports (`generateSecret`, `verify`). Also fixed subpath import issue - package only exports main entry point.

**Files:**
- `src/lib/auth/mfa.ts` (updated - rewritten for new otplib API)

**Commit:**
```
fix(mfa): update oplib to v12+ API with TOTP class

- Changed from authenticator to TOTP class
- Use generateSecret and verify functional exports
- Remove non-existent ./authenticator subpath import
```

---

## [2026-02-07 20:05] — Fix: SQLCipher Database Initialization and Vite Config

**Summary:** Fixed "file is not a database" error caused by drizzle-kit push creating unencrypted databases while app expects SQLCipher encryption. Created custom init script that uses better-sqlite3-multiple-ciphers with proper encryption. Fixed schema mismatch - now creates all required tables (users, sessions, backup_codes) with correct columns matching schema.ts. Also configured Vite to ignore documentation files from triggering reloads.

**Files:**
- `scripts/init-db.ts` (created - SQLCipher encrypted database initialization with correct schema)
- `vite.config.ts` (updated - ignore VERSION_HISTORY.md, docs/, .planning/)
- `docs/setup/database.md` (updated - SQLCipher encryption documentation)

**Commit:**
```
fix(database): add SQLCipher init script and update vite config

- Add scripts/init-db.ts for encrypted database creation
- Configure Vite to ignore documentation files from HMR
- Update database.md with SQLCipher-specific instructions
- Document why drizzle-kit push is incompatible with encryption
```

**Context:** The app uses SQLCipher for database encryption, but drizzle-kit push creates standard SQLite databases. When the app tried to open the unencrypted database with encryption pragmas, it failed with "file is not a database" error. The init script uses the same encryption settings as the app to ensure compatibility.

---

## [2026-02-07 19:56] — Documentation: Database Setup Guide

**Summary:** Created comprehensive database setup guide in docs/setup/database.md documenting Drizzle ORM schema initialization, migration commands, and troubleshooting for "no such table" errors.

**Files:**
- `docs/setup/database.md` (created - database initialization guide)

**Commit:**
```
docs(database): add database setup and initialization guide

- Document db:push command for development setup
- Document migration workflow for production
- Add troubleshooting section for common errors
```

**Context:** Encountered "no such table: users" error during testing. Database schema exists but tables not created. Documentation provides clear setup instructions for future developers and deployment.

---

## [2026-02-07 19:49] — Quick Task 003: Fix Home Page Login/Register Links

**Summary:** Converted non-functional span elements on the home page to functional anchor tags that navigate to /register and /login routes. Preserved the bracket-link styling class for terminal aesthetic consistency.

**Files:**
- `src/routes/+page.svelte` (updated - converted span elements to anchor tags with href attributes)
- `.planning/quick/003-fix-home-page-login-register-links/003-SUMMARY.md` (created - task summary)

**Commit:**
```
fix(quick-003): convert home page auth links from span to anchor tags

- Changed "Create Account" from <span> to <a href="/register">
- Changed "Log In" from <span> to <a href="/login">
- Preserved bracket-link styling class for terminal aesthetic
```

**Context:** Home page had non-functional span elements styled as links (bracket-link class). Users could not click to navigate to register or login pages. Converting to anchor tags with href attributes enables navigation while preserving the terminal aesthetic.

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
