# Tasks: ui-polish-svelte5

## 1. Svelte 5 syntax sweep

- [ ] 1.1 `(auth)/+layout.svelte`: `let { children } = $props()` + `{@render children()}`
- [ ] 1.2 `accounts/liabilities/+page.svelte`: `let { data } = $props()`
- [ ] 1.3 `+error.svelte`: `page` from `$app/state`, `$derived(page.error)`
- [ ] 1.4 `$derived(() => fn)` → `$derived.by`/`$derived` in: `+page.svelte` (filteredGoals), `goals/[slug]` (projection), `goals/create` (isValid), `GoalCard`, `GoalDetailCard`, `IsaAllowanceWidget`, `AlertBadge`, `step-review-overlap`, `snapshots/create`
- [ ] 1.5 Grep gates clean: `export let`, `$app/stores`, `<slot`, `$derived(() =>`

## 2. Aesthetic conformance

- [ ] 2.1 yellow→amber: `accounts/isa/[year]`, `settings/profile`, `budgets/[month]` (edit highlight)
- [ ] 2.2 Remove `rounded` (profile code chips); inline `text-shadow` (snapshots); `shadow-[8px_8px_0…]` → `shadow-hard` (ExclusionsModal); `border-` typo → `border-b` (liabilities)
- [ ] 2.3 Padding normalization p-4/p-6/p-8 → p-2/p-3: `goals/debt/create`, `step-upload`, `accounts/[slug]/delete` info boxes, `tools`, `overview/reports`
- [ ] 2.4 Profile `/register` link → `bracket-link`

## 3. Dead code

- [ ] 3.1 Delete `ConfirmationModal`, `CreateSnapshotModal`, `ProgressBarVariants`, `ui/button`, `ui/card`, `ui/input` + index exports
- [ ] 3.2 Remove unused symbols: `goto` (root +page), `closeToYear` (tax), `onReset` decl (step-confirm)

## 4. Reachability

- [ ] 4.1 Link `/goals/debt/create` from the goals debt view (filtered empty state)
- [ ] 4.2 Fix note-detail back-link (label `[Notes]` → href to notes index or account page, consistently)
- [ ] 4.3 Link `/accounts/[slug]/notes` from NotesSection header

## 5. Accessibility

- [ ] 5.1 `aria-label="Close modal"` on AccountSortModal + AccountFiltersModal close buttons; drop `text-red-700` (non-status)
- [ ] 5.2 `role="radiogroup"` + `aria-label` around TerminalRadio groups at usage sites
- [ ] 5.3 Label the tax closeBand input (`<label for>`)

## 6. Verification

- [ ] 6.1 `npm run check` + `npx vitest run` green; biome clean
- [ ] 6.2 Grep gates from 1.5 + 2.x enforced (document the gate commands in docs/dev if useful)
- [ ] 6.3 VERSION_HISTORY entry
