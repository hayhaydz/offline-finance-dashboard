# Tasks: ui-form-feedback

## 1. Shared enhance helper (systemic fix)

- [ ] 1.1 `use-submit-feedback.svelte.ts`: add `error` branch (generic message; dev includes `result.error?.message`); call `update()` for `redirect` results unconditionally (keep `applyFailures` semantics for `failure`)
- [ ] 1.2 Test: handler invoked with `{type:'error'}` sets failure feedback; `{type:'redirect'}` triggers update/navigate path

## 2. Per-form fixes

- [ ] 2.1 `ExclusionsModal.svelte`: failure branch + `update()` on non-success
- [ ] 2.2 `settings/data/+page.svelte`: render `form?.error`; reset `scanning` after failure (applyFailures-style enhance)
- [ ] 2.3 `goals/+page.svelte` reorder: error feedback on failed move; `invalidateAll()` on success
- [ ] 2.4 Budgets history pagination: replace `history.pushState` with `useUrlPagination('page')`

## 3. Typed confirmations

- [ ] 3.1 `goals/debt/[slug]/confirm-archive`: destructure + render `form`; typed-name input; server validates `confirmName` (fix misleading copy)
- [ ] 3.2 `goals/[slug]/confirm-archive`: add `name="confirmName"` + server-side validation (currently client-only)
- [ ] 3.3 Tests: wrong/right typed names for both archive paths

## 4. Bindable props

- [ ] 4.1 `$bindable` in `TransactionsSection` (editMode, addTransactionOpen), `NotesSection` (addNoteOpen), `InterestRatesSection` (addRateOpen); parents pass `bind:`
- [ ] 4.2 Verify no other non-bindable prop writes (grep `= false}` callbacks on plain props in components)

## 5. Verification

- [ ] 5.1 `npm run check` + `npx vitest run` green
- [ ] 5.2 Manual QA pass over previously-silent forms (refunds, exclusions, reorder, archive)
- [ ] 5.3 VERSION_HISTORY entry
