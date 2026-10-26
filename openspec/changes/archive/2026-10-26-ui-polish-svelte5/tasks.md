# Tasks: ui-polish-svelte5

## 1. Svelte 5 syntax sweep

- [x] 1.1 `(auth)/+layout.svelte`: `let { children } = $props()` + `{@render children()}`
- [x] 1.2 `accounts/liabilities/+page.svelte`: `let { data } = $props()`
- [x] 1.3 `+error.svelte`: `page` from `$app/state`, `$derived(page.error)`
- [x] 1.4 `$derived(() => fn)` → `$derived.by`/`$derived` in: `+page.svelte` (filteredGoals), `goals/[slug]` (projection), `goals/create` (isValid), `GoalCard`, `GoalDetailCard`, `IsaAllowanceWidget`, `AlertBadge`, `step-review-overlap`, `snapshots/create`
- [x] 1.5 Grep gates clean: `export let`, `$app/stores`, `<slot`, `$derived(() =>`

## 2. Aesthetic conformance

- [x] 2.1 yellow→amber: `accounts/isa/[year]`, `settings/profile`, `budgets/[month]` (edit highlight)
- [x] 2.2 Remove `rounded` (profile code chips); inline `text-shadow` (snapshots); `shadow-[8px_8px_0…]` → `shadow-hard` (ExclusionsModal); `border-` typo → `border-b` (liabilities)
- [x] 2.3 Padding normalization p-4/p-6/p-8 → p-2/p-3: `goals/debt/create`, `step-upload`, `accounts/[slug]/delete` info boxes, `tools`, `overview/reports`
- [x] 2.4 Profile `/register` link → `bracket-link`

## 3. Dead code

- [x] 3.1 Delete `ConfirmationModal`, `CreateSnapshotModal`, `ProgressBarVariants`, `ui/button`, `ui/card`, `ui/input` + index exports
- [x] 3.2 Remove unused symbols: `goto` (root +page), `closeToYear` (tax), `onReset` decl (step-confirm)

## 4. Reachability

- [x] 4.1 Link `/goals/debt/create` from the goals debt view (filtered empty state)
- [x] 4.2 Fix note-detail back-link (label `[Notes]` → href to notes index or account page, consistently)
- [x] 4.3 Link `/accounts/[slug]/notes` from NotesSection header

## 5. Accessibility

- [x] 5.1 `aria-label="Close modal"` on AccountSortModal + AccountFiltersModal close buttons; drop `text-red-700` (non-status)
- [x] 5.2 `role="radiogroup"` + `aria-label` around TerminalRadio groups at usage sites
- [x] 5.3 Label the tax closeBand input (`<label for>`)

## 6. Verification

- [x] 6.1 `npm run check` + `npx vitest run` green; biome clean
- [x] 6.2 Grep gates from 1.5 + 2.x enforced (document the gate commands in docs/dev if useful)
- [x] 6.3 VERSION_HISTORY entry
