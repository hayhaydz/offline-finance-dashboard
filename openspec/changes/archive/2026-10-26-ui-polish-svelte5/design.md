# Design: ui-polish-svelte5

## Context

Audit UI findings 6–9, 11–24. Pure consistency/debt work — no behavior changes except dead-code deletion and two links.

## Goals / Non-Goals

**Goals:**
- One syntax generation (Svelte 5) across app code
- Aesthetic tokens exactly as AGENTS.md defines (no rounds/shadows/off-token colors; semantic colors only)
- No shipped dead components; every route reachable or deleted

**Non-Goals:**
- Redesigns, new features, copywriting
- shadcn-skeleton removal beyond the unused pieces (FormField etc. stay)

## Decisions

1. **Mechanical sweeps, batched per category** (syntax → tokens → dead code → links → a11y) so each is greppably verifiable.
2. **Delete dead shadcn remnants outright** (Button/Card/Input, three unused components) rather than unexporting — zero imports confirmed by audit; biome `check` guards regressions.
3. **`/accounts/[slug]/notes` index: link it** from NotesSection header (cheapest reachability fix; the route provides a useful full-list view); note-detail back-link fixed to point where it says.
4. **Radiogroup wrapping done at usage sites** (accounts/create pickers) not inside TerminalRadio — the component stays generic.

## Risks / Trade-offs

- `$derived` sweeps touch many files — low risk (compiler enforces), verified by `svelte-check` + tests.
- Deleting unused UI components is irreversible in git terms only (recoverable).
