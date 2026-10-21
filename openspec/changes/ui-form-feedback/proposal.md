# Proposal: ui-form-feedback

## Why

Audit UI-domain majors: the shared `createEnhanceHandler` swallows `error` results (≈25 forms show nothing when an action throws) and cannot follow redirects (latent repeat of the unlock-page bug class), `ExclusionsModal` drops all failures, the debt archive confirm page neither renders form errors nor has a typed-confirmation gate (single click archives), `settings/data` renders no action errors, three section components write to non-`$bindable` props (latent state desync), and the budgets history pagination uses raw `history.pushState` which desyncs the SvelteKit router.

## What Changes

- `createEnhanceHandler`: handle `error` results (generic failure banner), call `update()` for `redirect` results unconditionally, keep `applyFailures` semantics
- `ExclusionsModal`: render failure feedback + call `update()` on non-success
- `goals/debt/[slug]/confirm-archive`: destructure `form` + render errors; add typed-goal-name confirmation (name input + server-side check, matching savings/deletes)
- `settings/data`: render `form?.error` for refund actions; reset `scanning` state after failure
- Goals reorder (`goals/+page.svelte`): surface failure feedback + `invalidateAll()` on success
- `$bindable` props in `TransactionsSection`, `NotesSection`, `InterestRatesSection` (parents pass `bind:`)
- Budgets history pagination: replace `history.pushState` with the `useUrlPagination` composable (`goto`)

## Capabilities

### New Capabilities

- `form-feedback` — every enhanced form surfaces success, failure, and error outcomes and follows action redirects; destructive confirmations enforce typed gates server-side

### Modified Capabilities

(none)
