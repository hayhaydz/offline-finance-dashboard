# Proposal: ui-polish-svelte5

## Why

Audit UI minors: Svelte 4 legacy syntax survives in three spots, the `$derived(() => fn)` anti-pattern appears in ~12 components (function-valued derived re-run every read), dead shadcn components and unused exports ship aesthetic violations (rounded corners, shadows, dark-mode palettes) alongside real pages drifting from the terminal aesthetic (yellow vs amber, `rounded`, inline text-shadow, over-padding, a broken `border-` class), several a11y gaps (unlabeled close buttons, placeholder-only input, missing radiogroup), and a handful of unused symbols.

## What Changes

- Svelte 5 modernization: `(auth)/+layout.svelte` snippet pattern; `liabilities` `$props()`; `+error.svelte` on `$app/state`; `$derived(() => …)` call-site anti-pattern → `$derived.by`/plain `$derived` (~12 files)
- Aesthetic conformance: yellow→amber everywhere; remove `rounded` (settings/profile), inline `text-shadow` (snapshots), `shadow-[...]` → `shadow-hard` (ExclusionsModal), `border-` typo (liabilities), over-padded sections → p-2/p-3; profile register link → `bracket-link`
- Dead code: delete `ConfirmationModal`, `CreateSnapshotModal`, `ProgressBarVariants`, `ui/Button`, `ui/Card`, `ui/Input` (+ their index exports); remove unused `goto` import (+page), `closeToYear` (tax), `onReset` prop decl (step-confirm)
- Reachability: link `/goals/debt/create` from the goals debt view; fix note-detail back-link label/href; `/accounts/[slug]/notes` index decision (link it or remove)
- A11y: `aria-label="Close modal"` on sort/filters close buttons (+ drop non-status red); `role="radiogroup"` + `aria-label` around TerminalRadio groups; label the tax closeBand input

## Capabilities

### New Capabilities

- `ui-polish` — terminal-aesthetic conformance, Svelte 5 idioms, dead-code removal, and accessibility baselines for interactive controls

### Modified Capabilities

(none)
