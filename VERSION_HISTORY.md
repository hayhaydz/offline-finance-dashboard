## [2026-02-09 23:55] — Fix: Filter Count Logic and UI Cleanup

**Summary:** Fixed a bug where empty multi-select filters were being counted as "active" in the filter indicator. Cleaned up redundant modal component rendering in `accounts/+page.svelte`.

**Files:**
- `src/routes/accounts/+page.svelte`: Implemented `activeFilterCount` to correctly evaluate non-empty strings and arrays; removed duplicate `AccountFiltersModal` block.

**Commit:**
```
fix(accounts): correct active filter counting and remove duplicate component
```

## [2026-02-09 23:45] — Feature: Multi-Select Account Filtering

**Summary:** Enhanced the advanced filter modal to support multi-selection for Account Type, Tax Wrapper, Liquidity, and Institution. This allows users to view complex account cross-sections (e.g., "Savings AND Investments").

**Files:**
- `src/lib/components/AccountFiltersModal.svelte`: Updated state to use arrays for multi-select fields; implemented toggle logic and comma-separated URL parameter generation.
- `src/routes/accounts/+page.svelte`: Updated filter logic to support array-based matching and comma-separated URL parameter parsing.

**Commit:**
```
feat(accounts): add multi-select support for key filter categories
```

## [2026-02-09 23:30] — UI: Accordion-Based Advanced Filter Modal

**Summary:** Refined the advanced filter modal into a single-column accordion layout. This design improves mobile/desktop UX by stacking categories vertically, removing nested scroll areas, and increasing text readability while maintaining the terminal aesthetic.

**Files:**
- `src/lib/components/AccountFiltersModal.svelte`: Implemented vertically stacked sections with smooth transitions and full-modal scrolling.

**Commit:**
```
ui(accounts): refactor filter modal to accordion layout for better readability
```

## [2026-02-09 23:15] — UI: Advanced Filter Modal Design Overhaul

**Summary:** Redesigned the advanced filter modal to use a more spacious "Control Panel" layout. Increased width, added logical section numbering, and utilized a multi-column grid to improve information density and UX while adhering to the terminal aesthetic.

**Files:**
- `src/lib/components/AccountFiltersModal.svelte`: Expanded to `max-w-2xl`, implemented multi-column layout, and added ASCII/System-style metadata and borders.

**Commit:**
```
ui(accounts): overhaul filter modal to control panel style for better UX
```

## [2026-02-09 23:00] — UI: Terminal-Style Filters in Advanced Modal

**Summary:** Refactored the advanced filters modal to use terminal-style `[X]` checkboxes and radio-like selectors instead of standard HTML dropdowns, improving visual consistency with the rest of the application.

**Files:**
- `src/lib/components/AccountFiltersModal.svelte`: Replaced all `<select>` elements with custom terminal-style interactive elements.

**Commit:**
```
ui(accounts): refactor advanced filters to terminal-style checkboxes/radio
```

## [2026-02-09 22:45] — UX: Quick Add Balance Accordion

**Summary:** Relocated the "Quick Balance Entry" form to the top of the accounts page (above the table) and wrapped it in a smooth CSS-transition accordion to save space while keeping it easily accessible.

**Files:**
- `src/routes/accounts/+page.svelte`: Moved form section and implemented smooth height transition with `grid-template-rows`.

**Commit:**
```
ux(accounts): move quick add form to top with smooth accordion
```

## [2026-02-09 22:30] — Feature: Advanced Account Filtering Modal

**Summary:** Implemented a comprehensive "Advanced Filters" modal on the accounts page. Added support for filtering by status (open/closed), net worth exclusion, category (asset/liability), tax wrapper, account type, liquidity, staleness, and institution.

**Files:**
- `src/lib/components/AccountFiltersModal.svelte`: Created new modal component for complex filter management.
- `src/routes/accounts/+page.server.ts`: Added unique institutions to page data for filtering.
- `src/routes/accounts/+page.svelte`: Integrated filter modal, added complex filtering logic, and updated header UI with filter status.

**Commit:**
```
feat(accounts): implement advanced filtering modal and multi-parameter logic
```

## [2026-02-09 22:10] — Feature: Account Type Filtering and Navigation

**Summary:** Added support for filtering accounts by type on the main accounts page via URL parameters. Connected the dashboard's "Accounts by Type" table to these filtered views for easier navigation.

**Files:**
- `src/routes/accounts/+page.svelte`: Added reactivity to handle `type` search parameter, filtering the account list accordingly. Added filter status indicator and "Clear" button.
- `src/routes/+page.svelte`: Linked account type rows to the filtered accounts page.

**Commit:**
```
feat(accounts): add type-based filtering and dashboard navigation links
```

## [2026-02-09 21:55] — UI: Layout Improvements for Accounts by Type Table

**Summary:** Refined the "Accounts by Type" table layout by moving account counts to a dedicated first column and ensuring all text columns are properly left-aligned for better readability.

**Files:**
- `src/routes/+page.svelte`: Added `[#]` column for account counts; updated "Type" and "Balance" columns to `text-left` alignment.

**Commit:**
```
ui(dashboard): improve accounts by type table layout and alignment
```

## [2026-02-09 21:45] — Fix: Accessibility (A11y) Cleanup in Exclusions Modal

**Summary:** Resolved all `npm run check` accessibility warnings in the `ExclusionsModal` component. Added appropriate ARIA roles, keyboard event handlers, and focus management (tabindex).

**Files:**
- `src/lib/components/ExclusionsModal.svelte`: Added `role="dialog"`, `role="presentation"`, `role="button"`, `tabindex`, and keyboard listeners for backdrop and type toggles.

**Commit:**
```
fix(a11y): resolve svelte-check warnings in exclusions modal
```

## [2026-02-09 21:40] — Refactor: Dashboard Accounts Overview to Accounts by Type

**Summary:** Replaced the flat individual account list on the dashboard with a grouped "Accounts by Type" overview. This provides a cleaner summary of the portfolio structure while remaining in sync with net worth exclusions.

**Files:**
- `src/lib/utils/currency.ts`: Promoted `formatAccountType` and `formatDate` to shared utilities.
- `src/routes/+page.svelte`: Implemented grouping logic and new table layout for Assets and Liabilities by type, including exclusion styling (line-through).

**Commit:**
```
refactor(dashboard): change accounts overview to grouped accounts by type
```

## [2026-02-09 21:25] — Fix: UI Reactivity for Net Worth Exclusions

**Summary:** Fixed issue where net worth dashboard UI would not update after changing exclusions without a hard refresh. Fixed display logic for excluded liabilities to correctly handle negative values. Refactored components to use proper Svelte 5 runes and standard SvelteKit data handling.

**Files:**
- `src/routes/+page.svelte`: Updated to use Svelte 5 `$props()` instead of legacy `$:` reactive declarations for page data.
- `src/lib/components/NetWorthDisplay.svelte`: Refactored `$derived` functions to `$derived` values; fixed `excludedLiabilities` visibility condition to use `Math.abs()`.
- `src/lib/components/ExclusionsModal.svelte`: Refactored `$derived` functions to `$derived` values and updated `use:enhance` to use the standard `update()` function for reliable data invalidation.

**Commit:**
```
fix(ui): resolve dashboard reactivity issues by modernizing to Svelte 5 runes
```

## [2026-02-09 21:00] — UX Improvement: Save Button Disabled State Visual Distinction

**Summary:** Made Save Changes button visually distinct when disabled vs enabled. Created simple `cn()` utility for conditional class names.

**Files:**
- `src/lib/utils/cn.ts` (created - simple clsx utility)
- `src/lib/components/ExclusionsModal.svelte` (added dynamic button styling based on hasChanges state)

**Commit:**
```
ux(03-03): add distinct disabled state for save button

- Create cn() utility for conditional classnames
- Disabled button: gray background, gray text, no hover
- Enabled button: black background, white text, with hover
- Fixed hasChanges derived call (need to call it as function)
```

**Context:** The disabled state wasn't visually obvious. Now users clearly see when save is available (black) vs when no changes have been made (gray).

---

## [2026-02-09 20:55] — Bugfix: ExclusionsModal State Tracking and Save Button UX

**Summary:** Fixed modal toggle state not displaying ([X] wasn't showing) due to Svelte 5 Map reactivity. Added proper disabled state for Save Changes button - only enabled when user makes changes from original state.

**Files:**
- `src/lib/components/ExclusionsModal.svelte` (fixed Map mutation, added hasChanges derived, added originalStates tracking)

**Commit:**
```
fix(03-03): fix modal state tracking and save button ux

- Fix Map.set() reactivity by creating new Map reference
- Track originalStates when modal opens
- Add hasChanges derived to compare current vs original
- Disable Save Changes button until changes are made
- Add proper disabled styling (opacity, cursor, no-hover)
```

**Context:** Svelte 5 requires new object references for reactivity on Maps/Sets. Direct Map.set() mutations don't trigger re-renders. Also improved UX by preventing accidental saves when nothing changed.

---

## [2026-02-09 20:50] — Bugfix: Accounts Page Net Worth and Table Alignment

**Summary:** Fixed net worth calculation on accounts page (same bug as home page - liabilities are negative values, so add them). Also fixed table headings to be left-aligned instead of centered.

**Files:**
- `src/routes/accounts/+page.svelte` (fixed formula, added Math.abs for display, added text-left to th elements)

**Commit:**
```
fix(accounts): correct net worth calculation and table alignment

- Change formula from assets - liabilities to assets + liabilities
- Display liabilities as positive value (red color indicates liability)
- Add text-left class to table headings for proper alignment
```

**Context:** The accounts page had the same calculation bug as the home page. Since liability balances are stored as negative values in the database, we add them (not subtract) to get net worth. Table headings were centered by default in browsers, needed explicit left alignment.

---

## [2026-02-09 20:45] — UI Fix: Modal Matches Mockup Exactly

**Summary:** Rewrote ExclusionsModal to match mockup design exactly - shows account types with counts (not individual accounts), excluded types are dimmed gray, proper box-shadow and button styling.

**Files:**
- `src/lib/components/ExclusionsModal.svelte` (rewritten - type-based exclusion UI)

**Commit:**
```
style(03-03): modal matches mockup design exactly

- Show account types (Current, Savings, etc.) with counts
- Click entire row to toggle all accounts of that type
- Excluded types show dimmed gray color
- Fixed 380px width with 8px box-shadow
- Button styling: Save Changes (black), Cancel (white)
- Hover effect on rows (light gray background)
```

**Context:** Previous implementation showed individual accounts. Mockup shows account TYPES grouped with counts. Toggling a type excludes ALL accounts of that type. This is a UX pattern change from per-account to per-type exclusion.

---

## [2026-02-09 20:40] — UI Enhancement: Terminal-Style Toggles

**Summary:** Replaced vanilla HTML checkboxes and radio buttons with terminal-style `[X]` and `[•]` toggles matching the mockup design. Created reusable TerminalToggle and TerminalRadio components.

**Files:**
- `src/lib/components/ui/terminal-toggle/TerminalToggle.svelte` (created - checkbox with `[X]` style)
- `src/lib/components/ui/terminal-toggle/TerminalRadio.svelte` (created - radio with `[•]` style)
- `src/lib/components/ui/terminal-toggle/index.ts` (created - exports)
- `src/lib/components/ExclusionsModal.svelte` (updated - uses TerminalToggle)
- `src/routes/accounts/create/+page.svelte` (updated - uses TerminalRadio for type/tax wrapper)

**Commit:**
```
style(03-03): add terminal-style toggle components

- Create TerminalToggle component with [X] checkbox style
- Create TerminalRadio component with [•] radio style
- Update ExclusionsModal to use terminal toggles
- Update account creation form to use terminal radios
- Match mockup design from net-worth-exclusion-mockup-v2.html
```

**Context:** The vanilla browser inputs didn't match the terminal aesthetic. New components use `[X]` for checkboxes (excluded state), `[ ]` for empty, and `[•]` for selected radio items with hover/focus states and keyboard support.

---

## [2026-02-09 20:30] — Bugfix: Net Worth Calculation and Display

**Summary:** Fixed net worth calculation formula (assets + liabilities, not assets - liabilities) since liability balances are stored as negative values in the database. Also fixed liability display to show positive values with red color instead of negative values.

**Files:**
- `src/routes/+page.server.ts` (changed formula to `totalAssets + totalLiabilities`)
- `src/lib/components/NetWorthDisplay.svelte` (added `Math.abs()` for liability display)

**Commit:**
```
fix(03-01): correct net worth calculation and liability display

- Change formula from assets - liabilities to assets + liabilities
- Liabilities stored as negative values in database
- Display liabilities as positive values (red color indicates liability type)
```

**Context:** Liability balances (e.g., credit cards, loans) are stored as negative values in the database. The calculation was double-negating them, resulting in incorrect net worth. Example: £66,800 - (-£14,050) = £80,850 (wrong). Fixed to: £66,800 + (-£14,050) = £52,750 (correct).

---

## [2026-02-09 20:23] — Task 3: Integrate ExclusionsModal with NetWorthDisplay

**Summary:** Updated NetWorthDisplay component to integrate the ExclusionsModal, replacing the placeholder modal. Added accounts prop to pass account data to the modal. Updated home page to pass accounts from page.data.

**Files:**
- `src/lib/components/NetWorthDisplay.svelte` (added accounts prop, replaced placeholder modal)
- `src/routes/+page.svelte` (passed accounts prop to NetWorthDisplay)

**Commit:**
```
feat(03-03): integrate ExclusionsModal with NetWorthDisplay

- Add Account interface import to NetWorthDisplay
- Add ExclusionsModal component import
- Add accounts prop to Props interface
- Replace placeholder modal with ExclusionsModal component
- Update home page to pass accounts prop from page.data
```

**Context:** Task 3 of Phase 03-03 (Net Worth Dashboard). The NetWorthDisplay now fully integrates the exclusion modal, allowing users to toggle account exclusions from the net worth display.

---

## [2026-02-09 20:22] — Task 2: Add Bulk Exclusion Update Action

**Summary:** Added updateExclusions form action to +page.server.ts for bulk exclusion updates using Drizzle ORM CASE statement. Implemented authentication validation, form data parsing, and row-level security.

**Files:**
- `src/routes/+page.server.ts` (added updateExclusions action with CASE statement bulk update)

**Commit:**
```
feat(03-03): add bulk exclusion update action

- Import Actions type, logError, and drizzle-orm functions
- Add updateExclusions action to actions export
- Validate authentication before processing
- Parse form data for account_ prefixed keys
- Build CASE statement SQL for efficient bulk update
- Perform db.update() with row-level security
- Add error handling with try/catch
- Log operations with devLog and logError
```

**Context:** Task 2 of Phase 03-03 (Net Worth Dashboard). The server action handles bulk exclusion updates efficiently using a CASE statement instead of individual UPDATE queries, maintaining row-level security.

---

## [2026-02-09 20:21] — Task 1: Create ExclusionsModal Component

**Summary:** Created ExclusionsModal.svelte component with account grouping, checkbox state tracking, keyboard/backdrop handlers, and form with enhance(). Follows terminal aesthetic design from mockup with black title bar and bracket-link buttons.

**Files:**
- `src/lib/components/ExclusionsModal.svelte` (created modal component with full implementation)

**Commit:**
```
feat(03-03): create ExclusionsModal component

- Implement props interface (open, onClose, accounts)
- Add checkbox state tracking using $state with Map
- Implement state reset on modal open via $effect
- Add keyboard handler (Escape to close)
- Add backdrop click handler
- Implement groupByType function for account organization
- Add formatTypeLabel function for display labels
- Create modal structure with black title bar
- Add assets and liabilities sections with type grouping
- Add form with enhance() and hidden inputs for checkbox states
- Follow terminal aesthetic design from mockup
```

**Context:** Task 1 of Phase 03-03 (Net Worth Dashboard). The modal component provides a UI for users to toggle account exclusions from net worth calculation, with local state tracking that only applies changes on save.

---

## [2026-02-09 20:17] — Task 2: Update Home Page to Use NetWorthDisplay Component

**Summary:** Updated home page (+page.svelte) to use the new NetWorthDisplay component, passing all required props from the server load function. Removed placeholder net worth data and integrated real server-side calculations.

**Files:**
- `src/routes/+page.svelte` (replaced placeholder sections with NetWorthDisplay component)

**Commit:**
```
feat(03-02): update home page to use NetWorthDisplay component

- Import NetWorthDisplay component
- Pass all required props from page.data to NetWorthDisplay
- Remove placeholder net worth and accounts data
- Import and use formatCurrency for account overview table
- Keep placeholder sections (savings goals, accounts overview) below net worth display
```

**Context:** Task 2 of Phase 03-02 (Net Worth Dashboard). The home page now displays real net worth data from the server-side calculation, with proper props passing to the NetWorthDisplay component.

---

## [2026-02-09 20:17] — Task 1: Create NetWorthDisplay Component

**Summary:** Created NetWorthDisplay.svelte component with full net worth display, breakdown section, date range formatting, stale data warning, exclusions button with modal placeholder, and terminal aesthetic styling.

**Files:**
- `src/lib/components/NetWorthDisplay.svelte` (created with net worth display UI)

**Commit:**
```
feat(03-02): create NetWorthDisplay component

- Create component with Svelte 5 runes API ($props, $state, $derived)
- Add props interface for net worth data (netWorth, totalAssets, totalLiabilities, etc.)
- Implement color-coded net worth display (green for positive, red for negative)
- Add breakdown section showing total assets and liabilities
- Show excluded amounts in gray when applicable
- Display date range using formatDateRange utility
- Show stale warning when hasStaleData is true
- Add exclusions button with count that opens modal
- Implement modal state management (open/close functions)
- Handle zero net worth case with neutral color and helper text
- Add keyboard accessibility (Escape to close modal)
- Follow terminal aesthetic with bracket-link styling
```

**Context:** Task 1 of Phase 03-02 (Net Worth Dashboard). This component displays the net worth prominently on the home page, matching the mockup specification. The modal is a placeholder that will be fully implemented in phase 03-03.

---

## [2026-02-09 20:10] — Task 2: Add Date Range Formatting Utility

**Summary:** Added date range formatting functions to currency.ts for displaying "as of" dates on the net worth dashboard. Handles same-year and different-year cases, single dates, and uses locale-aware formatting.

**Files:**
- `src/lib/utils/currency.ts` (added formatDateForRange and formatDateForRange functions)

**Commit:**
```
feat(03-01): add date range formatting utility

- Add formatDateForRange() for single date formatting (en-GB locale)
- Add formatDateRange() for intelligent date range display
- Same year: "as of 1 Jan - 15 Feb 2026"
- Different years: "as of 1 Jan 2025 - 15 Feb 2026"
- Single date: "as of 1 Jan 2026"
- Export both functions for use in net worth display
```

**Context:** Task 2 of Phase 03-01 (Net Worth Dashboard). The date range formatting follows the mockup specification and uses Intl.DateTimeFormat for locale-aware month names.

---

## [2026-02-09 20:10] — Task 1: Add Net Worth Data Loading Function

**Summary:** Created server-side load function for home page that calculates net worth from user's accounts and balances. Implements row-level security, handles excluded accounts, detects stale data, and calculates date ranges.

**Files:**
- `src/routes/+page.server.ts` (created with net worth calculation load function)

**Commit:**
```
feat(03-01): add net worth data loading function to home page

- Create +page.server.ts with authentication check and redirect
- Fetch all user accounts with latest balance using row-level security
- Calculate net worth: totalAssets - totalLiabilities (included accounts only)
- Track excluded assets and liabilities separately
- Determine date range from oldest and newest balance dates
- Detect stale data (balances older than 30 days)
- Count excluded accounts for UI display
- Add comprehensive logging for debugging
```

**Context:** Task 1 of Phase 03-01 (Net Worth Dashboard). This creates the server-side data layer needed for the home page net worth display. All calculations happen server-side for security and efficiency.

---

## [2026-02-09 18:29] — Account Types and Data Model Cleanup

**Summary:** Separated account types from tax wrappers, added category field for asset/liability distinction, and improved account creation UX with dual radio button forms.

**Files:**
- `src/lib/db/schema.ts` (added taxWrapper, category fields; updated type enum to 6 values)
- `src/lib/validation/rules.ts` (updated ACCOUNT_TYPES, added TAX_WRAPPERS constant)
- `src/routes/accounts/create/+page.svelte` (dual radio buttons with reactive disabled state)
- `src/routes/accounts/create/+page.server.ts` (category auto-calculation, new field validation)
- `src/routes/accounts/[slug]/edit/+page.svelte` (dual radio buttons for edit form)
- `src/routes/accounts/[slug]/edit/+page.server.ts` (update action with new fields)
- `src/routes/accounts/+page.svelte` (use category field for net worth calculations)
- `src/routes/accounts/+page.server.ts` (include category and taxWrapper in response)
- `src/routes/accounts/[slug]/+page.svelte` (added tax wrapper display)
- `src/routes/accounts/[slug]/delete/+page.svelte` (updated type labels)
- `src/routes/accounts/[slug]/balances/[balanceSlug]/edit/+page.svelte` (updated type labels)
- `tests/integration/database.test.ts` (added new required fields)

**Commit:**
```
feat(02.1-01): separate account types from tax wrappers and add category field

- Update type enum: 6 core types (current, savings, investment, credit-card, loan, mortgage)
- Add taxWrapper field: none, isa, lisa (default 'none')
- Add category field: asset, liability (auto-calculated from type)
- Replace dropdown with dual radio buttons for type and tax wrapper
- Tax wrapper disabled for non-savings/investment accounts
- Auto-reset tax wrapper to 'none' when switching to incompatible type
- Use nuke and recreate strategy (no production data)
```

**Context:** Phase 02.1 cleans up the account data model to enable proper asset vs liability distinction needed for Phase 3 (Net Worth Dashboard). The old schema mixed account types with tax wrappers (ISA, LISA), preventing accurate net worth calculations.

---

## [2026-02-08 19:37] — Multi-Fix: GBP Currency, Breadcrumbs, Links, and UX Improvements

**Summary:** (1) Changed default currency from USD to GBP, (2) Fixed breadcrumb system to show account names instead of slugs with proper segmentIndex, (3) Fixed all remaining account.id links to use account.slug, (4) Improved message timing (10s success, errors persist with dismiss button), (5) Fixed navigation component for non-existent routes.

**Files:**
- `src/lib/utils/currency.ts` (en-GB locale, GBP currency, pounds/pence comments)
- `src/lib/components/navigation.svelte` (breadcrumbOverrides with segmentIndex, skipLink for non-routes)
- `src/routes/+layout.svelte` (pass breadcrumbOverrides to navigation)
- `src/routes/accounts/[slug]/+page.server.ts` (breadcrumbOverrides with account name)
- `src/routes/accounts/[slug]/edit/+page.svelte` (fixed cancel/close links to use slug)
- `src/routes/accounts/[slug]/delete/+page.server.ts` (breadcrumbOverrides with account name)
- `src/routes/accounts/[slug]/delete/+page.svelte` (fixed cancel link to use slug)
- `src/routes/accounts/[slug]/balances/[balanceSlug]/edit/+page.server.ts` (breadcrumbOverrides with account name, date, and skipLink)
- `src/routes/accounts/[slug]/balances/[balanceSlug]/edit/+page.svelte` (fixed cancel link to use slug)
- `src/routes/accounts/[slug]/+page.svelte` (10s success timeout, errors persist, dismiss button)
- `src/routes/accounts/+page.svelte` (10s success timeout, errors persist, dismiss button)

**Commit:**
```
fix: gbp currency breadcrumbs links messages timing

- Change default currency from USD to GBP (en-GB locale)
- Fix breadcrumb system: segmentIndex not breadcrumb array index
- Add skipLink for non-routes (balances, balance slugs)
- Fix remaining account.id links: edit, delete, edit balance pages
- Improve message timing: 10s success, errors persist until dismiss
- Add dismiss button to all feedback messages
- Account names now display in breadcrumbs instead of slugs
```

**Context:** User feedback identified remaining ID-based links after nanoid migration. Breadcrumb segmentIndex was off by 1 due to "Home" at index 0. Balance slug segments aren't clickable routes. GBP is now the default currency for this UK-focused finance tracker.

---

## [2026-02-08 19:13] — Bug Fixes: Conflict Detection, Caching, and Code Deduplication

**Summary:** Fixed three critical issues: (1) balance conflict detection now uses range query instead of Date equality, (2) delete balance uses goto() to force fresh data fetch bypassing browser cache, (3) extracted shared balance entry logic to eliminate 80+ lines of duplicate code, (4) fixed markdown link rendering in quick-add error messages.

**Files:**
- `src/lib/utils/balances.ts` (created shared addBalanceEntry function with range-based conflict detection)
- `src/routes/accounts/+page.server.ts` (refactored to use shared function, renamed action from 'default' to 'quickAdd')
- `src/routes/accounts/[slug]/+page.server.ts` (refactored to use shared function)
- `src/routes/accounts/[slug]/+page.svelte` (delete balance now uses goto() with invalidateAll)
- `src/routes/accounts/+page.svelte` (quick-add error messages now parse markdown links)

**Commit:**
```
fix(balances): conflict detection, caching, and deduplication

- Use range query (gte/lt) instead of Date equality for conflict detection
- Date equality doesn't work correctly with SQLite integer timestamps
- Delete balance now uses goto() to force fresh data fetch
- Quick-add error messages now render markdown links as HTML
- Extract shared addBalanceEntry utility function
- Eliminated 80+ lines of duplicate code between quick-add and add balance
- Both actions now use same validation, conflict detection, and insertion logic
```

**Context:** Date equality comparison with eq() was failing for SQLite integer timestamp columns, allowing duplicate entries for the same day. Browser caching was causing deleted entries to persist on normal refresh. Code duplication between quick-add and regular add made maintenance difficult.

---

## [2026-02-08 18:53] — UX: Eliminate Full Page Reloads for Quick-Add Balance Form

**Summary:** Converted accounts list page quick-add balance form from redirect-based flow to SPA-style response handling. The form now updates UI instantly without full page reload, matches the behavior implemented for the account detail page's add/delete balance forms.

**Files:**
- `src/routes/accounts/+page.server.ts` (quickAdd action returns { success } instead of redirect)
- `src/routes/accounts/+page.svelte` (added quickAddMessage state, updated use:enhance callback with proper error handling)

**Commit:**
```
feat(ux): spa-style quick-add balance on accounts list

- Change quickAdd action to return { success } instead of redirect
- Add quickAddMessage reactive state for success/error feedback
- Update use:enhance callback with proper message state handling
- Add error handling for result.type === 'failure' cases
- Form now clears and refreshes data via invalidateAll()
- Consistent UX with account detail page add/delete forms
```

**Context:** Completes the SPA-style modernization by applying the same request/response logic to the accounts list page quick-add form. Users can now add balance entries from the accounts list without any page reloads, providing instant feedback and smoother UX.

---

## [2026-02-08 18:27] — Logging: Add Logging to All Fail, Error, and Redirect Calls

**Summary:** Completed comprehensive logging coverage by adding logging before every control flow exit point (fail, error, redirect) across the entire application. This creates a complete traceable history of all code paths and user actions. Security events (401, 429, 500) use logError, validation failures (400, 409) use devLog, and all redirects use devLog before executing.

**Files:**
- `src/routes/settings/profile/+page.server.ts` (added devLog before auth redirect, fixed throw redirect)
- `src/routes/snapshots/+page.server.ts` (added devLog before auth redirect, fixed throw redirect)
- `src/routes/accounts/[slug]/edit/+page.server.ts` (added logError before error 404, devLog before validation fails and redirect)
- `src/routes/accounts/[slug]/+page.server.ts` (added logError before error 404 and auth fails, devLog before validation fails and redirects)
- `src/routes/accounts/+page.server.ts` (added logError before auth fail, devLog before validation fails and redirect)
- `src/routes/accounts/create/+page.server.ts` (added logError before auth fail, logFormData before validation fail, devLog before redirect)
- `src/routes/accounts/[slug]/delete/+page.server.ts` (added logError before error 404, devLog before redirect)
- `.planning/quick/20-add-logging-to-all-fail-error-and-redire/020-SUMMARY.md` (created)

**Commit:**
```
feat(logging): add logging to all fail, error, and redirect calls

- Add devLog before authentication redirects in profile and snapshots
- Fix redirect calls to use throw redirect() syntax
- Add logError before error(404) in account edit, detail, and close pages
- Add logError before authentication failures across all account routes
- Add devLog before all validation failures (400, 409)
- Add devLog before all success redirects with context
- Add logFormData before validation fail returns in create account
- Complete audit trail coverage across entire application
```

**Context:** This completes the logging initiative by ensuring every control flow exit point is logged. The application now has complete traceable history: every fail(), error(), and redirect() call has appropriate logging before it. Security events use logError for auditing, validation failures use devLog for debugging, and success paths use devLog with context.

---

## [2026-02-08 18:12] — Logging: Add Comprehensive Server Operations Logging

**Summary:** Added comprehensive Winston-based logging to ALL remaining server operations (authentication, account operations, settings). All form actions now log form data at entry point with automatic sensitive field masking, successful operations log with relevant context, and errors use logError for security auditing. This completes full logging coverage across the entire application.

**Files:**
- `src/routes/accounts/[slug]/+page.server.ts` (added logFormData import, deleteBalance logging)
- `src/routes/accounts/[slug]/balances/[balanceSlug]/edit/+page.server.ts` (added logFormData import, comprehensive edit balance logging)
- `src/routes/logout/+page.server.ts` (added logger imports, logout logging)
- `src/routes/(auth)/register/+page.server.ts` (added logger imports, comprehensive registration logging)
- `src/routes/(auth)/login/+page.server.ts` (added logger imports, comprehensive login logging)
- `src/routes/(auth)/mfa-setup/+page.server.ts` (added logger imports, comprehensive MFA setup logging)
- `src/routes/(auth)/dev-login/+page.server.ts` (added logger imports, dev-login logging)
- `src/routes/settings/+page.server.ts` (added logger imports, settings page load logging)
- `src/routes/snapshots/+page.server.ts` (added logger imports, snapshots page load logging)
- `src/routes/settings/profile/+page.server.ts` (added logger imports, profile load logging)
- `.planning/quick/19-add-comprehensive-logging-to-all-remaini/019-SUMMARY.md` (created)

**Commit:**
```
feat(logging): add comprehensive logging to all remaining server operations

- Add logFormData to delete balance action
- Add comprehensive logging to edit balance page (load, validation, success)
- Add logging to logout operation
- Add comprehensive logging to registration flow
- Add comprehensive logging to login flow (with rate limit tracking)
- Add comprehensive logging to MFA setup flow
- Add logging to development auto-login
- Add logging to settings and snapshots page loads
- Add logging to profile settings page load
- Fix TypeScript errors with optional chaining on undefined locals.user
```

**Context:** This completes the logging coverage for all server-side operations in the application. Every operation now logs form data at entry point, successful operations log with context, and errors use logError for security auditing. The logger system automatically masks sensitive fields and development logs only output in development mode.

---

## [2026-02-08 14:30] — Logging: Add Comprehensive Account Operations Logging

**Summary:** Added comprehensive Winston-based logging to all account-related server operations (quick-add balance, edit account, close account). All form actions now log form data at entry point, successful operations log with relevant context, and errors are logged with appropriate details. This follows the logging patterns established in quick-014 and quick-015.

**Files:**
- `src/routes/accounts/+page.server.ts` (added logFormData, success logging, conflict logging)
- `src/routes/accounts/[slug]/edit/+page.server.ts` (added logger imports, load logging, form data logging, validation logging, success logging)
- `src/routes/accounts/[slug]/delete/+page.server.ts` (added logger imports, load logging, close action logging, error logging)
- `.planning/quick/18-add-comprehensive-logging-to-accounts-ar/018-SUMMARY.md` (created)

**Commit:**
```
feat(logging): add comprehensive logging to account operations

- Add logFormData to quick-add balance action (accounts list page)
- Add devLog for successful balance insertion with full context
- Add devLog for conflict detection (409) with existing balance details
- Add comprehensive logging to account edit operations
- Add comprehensive logging to account close operations
- Follow logging patterns from create/+page.server.ts
```

**Context:** This completes the logging coverage for all account operations (create, edit, close, quick-add balance). The logger system automatically masks sensitive fields and development logs only output in development mode. File logging with daily rotation is handled by Winston.

---

## [2026-02-08 17:35] — UX: Fix Delete Balance with Realtime Updates and Custom Modal

**Summary:** Replaced browser confirm() alert with custom ConfirmationModal component for balance deletion. Fixed Svelte 5 use:enhance callback syntax for proper form handling. Added realtime page invalidation after deletion and success/error feedback messages.

**Files:**
- `src/routes/accounts/[slug]/+page.svelte` (fixed enhance callbacks, added modal)
- `src/routes/accounts/[slug]/+page.server.ts` (return success message instead of redirect)
- `src/lib/components/ConfirmationModal.svelte` (created)
- `src/routes/+error.svelte` (created custom error page)

**Commit:**
```
fix(delete-balance): replace alert with modal and add realtime updates

- Replace browser confirm() with custom ConfirmationModal component
- Fix Svelte 5 use:enhance callback signature ({ result } not { action, formData })
- Add invalidate('accounts:[slug]') for realtime balance list refresh
- Change delete action to return success message instead of redirect
- Add submitMessage state for user feedback (success/error)
- Create +error.svelte for client-side error display
```

---

## [2026-02-08 15:42] — Documentation: Add URL Slug Rules

**Summary:** Added documentation rules to forbid database IDs in URLs, requiring nanoid-based slugs for all user-facing routes. Updated CLAUDE.md and GEMINI.md with security-focused URL slug rules and created architecture documentation for implementation guidance.

**Files:**
- `CLAUDE.md` (added "## 🔗 URL SLUGS" section)
- `GEMINI.md` (added "## 🔗 URL SLUGS" section)
- `docs/architecture/url-slugs.md` (created)

**Commit:**
```
docs(url-slugs): add nanoid-based URL slug rules

- Add URL SLUGS section to CLAUDE.md and GEMINI.md
- Forbid database IDs in user-facing routes (security/UX)
- Specify nanoids (16-21 chars) as required alternative
- Create implementation guide in docs/architecture/url-slugs.md
```

---

## [2026-02-08 15:33] — Feature: Add Development Logging System

**Summary:** Created environment-aware logging utility for development debugging. Added logging to account creation action to help debug form submission issues. Logger automatically masks sensitive fields (passwords, tokens, secrets) and suppresses output in production mode.

**Files:**
- `src/lib/utils/logger.ts` (created)
- `src/routes/accounts/create/+page.server.ts` (updated)

**Commit:**
```
feat(logging): add environment-aware development logging system

- Create logger.ts with devLog(), logError(), logFormData() functions
- Add sensitive field masking for passwords, tokens, secrets, API keys
- Add development logging to account creation action
- Production mode suppresses dev logs and sanitizes error logs
- Use built-in console methods (no external dependencies)
```

---

## [2026-02-08 15:21] — UI: Move Navigation to Top and Add Breadcrumbs

**Summary:** Moved navigation component from bottom to top of page and added breadcrumb trail for better UX. Implemented independent scrolling for main content area so navigation stays visible when viewing long content. All changes maintain the terminal aesthetic.

**Files:**
- `src/app.css` (added scrollable-content utility)
- `src/lib/components/navigation.svelte` (added breadcrumbs, removed bottom positioning)
- `src/routes/+layout.svelte` (moved nav to top, added scrollable wrapper)

**Commit:**
```
feat(ui): move navigation to top with breadcrumbs and scrollable content

- Add scrollable-content CSS utility with max-height constraint
- Add breadcrumb trail generation showing current page location
- Move Navigation component from bottom to top of layout
- Wrap main content in scrollable div for independent scrolling
- Remove bottom border and positioning from navigation
- Maintain terminal aesthetic (bracket links, borders, monospace)
```

---

## [2026-02-08 15:10] — Docs: Expand Database Documentation

**Summary:** Updated database setup and workflow guides to include `db:push` and `db:studio` commands. Clearly defined the "Tiered Environment Strategy" differences between development (Loose Mode) and production (Strict Encryption).

**Files:**
- `docs/setup/database.md` (updated)
- `docs/setup/database-workflow.md` (updated)

**Commit:**
```
docs: expand database guides with db:push and db:studio

- Document db:push for rapid development
- Document db:studio for data inspection (Loose Mode only)
- Clarify Dev vs Prod use cases and tool compatibility
- Add production deployment checklist
```

---

## [2026-02-08 15:00] — Fix: Resolve Svelte 5 State Warnings

**Summary:** Resolved 5 Svelte 5 `state_referenced_locally` warnings in the account creation page by decoupling `$state` initialization from props and using `$effect` for synchronization. This ensures proper reactivity and adheres to Svelte 5 best practices.

**Files:**
- `src/routes/accounts/create/+page.svelte` (updated)

**Commit:**
```
fix(ui): resolve Svelte 5 state warnings in account creation

- Decouple $state initialization from form prop
- Use $effect to sync form data after failed submissions
- Result: 0 errors, 0 warnings in svelte-check
```

---

## [2026-02-08 14:55] — Guidelines: Add QA & Validation Requirements

**Summary:** Updated `CLAUDE.md` and `GEMINI.md` with a new `🔍 QA & VALIDATION` section requiring TypeScript checks and full test suite execution after significant changes. Refined `ABSOLUTE RULES` to allow these necessary validation steps while maintaining restrictions on general command execution.

**Files:**
- `CLAUDE.md` (updated)
- `GEMINI.md` (updated)

**Commit:**
```
docs: add QA & validation requirements to agent guidelines

- Add 🔍 QA & VALIDATION section to CLAUDE.md and GEMINI.md
- Require npm run check and npm test after significant changes
- Tweak Absolute Rules to permit validation commands
```

---

## [2026-02-08 14:45] — Cleanup: Remove Legacy Init-DB Script

**Summary:** Deleted the legacy `scripts/init-db.ts` script as it has been replaced by the tiered environment strategy (Drizzle migrations + seed script). Updated `docs/setup/database.md` and architecture reports to reflect the new database initialization workflow.

**Files:**
- `scripts/init-db.ts` (deleted)
- `docs/setup/database.md` (updated)
- `docs/architecture/environment-strategy-plan.md` (updated)
- `docs/architecture/environment-strategy-report.md` (updated)

**Commit:**
```
chore: remove legacy init-db script and update documentation

- Delete scripts/init-db.ts (legacy manual table creation)
- Update database setup guide with new migration-based workflow
- Clarify "Loose Mode" vs "Production Mode" setup steps
- Mark init-db deprecation as completed in environment strategy plan
```

**Context:** The `init-db.ts` script was a manual precursor to the Drizzle-based migration system. With the implementation of the tiered environment strategy, the database client now handles file creation and encryption pragmas automatically, while Drizzle handles schema migrations. Initial data is now managed via `npm run db:seed`.