# Design: ui-form-feedback

## Context

Audit UI findings 1–4, 5, 10, 26, 27, 29 + goals reorder. The unlock-page redirect bug (fixed 2026-10-20) revealed the class: custom enhance logic that doesn't apply action results. The shared helper is the systemic instance.

## Goals / Non-Goals

**Goals:**
- No enhanced form can end in silence: success, failure (4xx), and error (5xx) all produce visible feedback or navigation
- Destructive actions gated by typed confirmation enforced server-side
- Router state changes only through SvelteKit navigation APIs

**Non-Goals:**
- Redesigning feedback visuals (keep the existing banner pattern)
- Touching the aesthetic/Svelte-5-modernization minors (separate change: `ui-polish-svelte5`)

## Decisions

1. **Fix at the helper.** `createEnhanceHandler` gains an `error` branch (generic "Action failed — try again" message via the same feedback banner; dev shows `result.error.message`) and calls `await update()` for `redirect` results before/instead of bare `invalidateAll()`. All ~25 consumer forms inherit the fix with zero markup changes.
2. **ExclusionsModal** mirrors the helper's branches locally (it has its own callback) — render a red error line + `update()` on non-success.
3. **Typed confirmation server-side.** Debt archive action validates `confirmName` equals the goal name (same contract as account delete); the page adds the input + disables button until match + renders `form?.error`. Savings confirm-archive gets `name="confirmName"` wiring for consistency.
4. **Bindable props** declared in the three section components; parents switch to `bind:` (mechanical; matches `TransactionFilterBar` precedent).
5. **Pagination via composable** (`useUrlPagination('page')`) — one call site.

## Risks / Trade-offs

- `update()` on redirect resets forms — irrelevant (navigation leaves the page).
- Typed gates add friction — consistent with existing delete flows.
