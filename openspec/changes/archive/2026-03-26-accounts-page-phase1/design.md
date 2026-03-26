## Context

The `/accounts/[slug]` page is the most information-dense page in the app. It already computes `projection[]`, `ttz`, `currentBalance`, and `monthlyBalances[]` on the server — all the data needed for Phase 1 is present in the page load. None of these additions require new queries, schema changes, or server logic.

The page is large (~1100 lines of Svelte). Changes are additive: new markup blocks inserted into existing sections, with no modifications to existing layout or component structure.

## Goals / Non-Goals

**Goals:**
- Surface trajectory context in the account header (balance delta strip) for all account types
- Enrich the debt projection section with five new metrics derived from already-loaded data
- All additions must conform to the terminal aesthetic: monospace, no colour decoration, semantic colour only (green/amber/red for status)
- Zero regressions: existing sections must render identically when new additions are absent (guarded by null checks)

**Non-Goals:**
- No server-side changes
- No schema changes
- No new Svelte components — inline additions to the existing `+page.svelte` only
- No interactivity beyond what already exists (interactive simulator is Phase 3)
- No changes to the debt projection toggle, expand/collapse, or period summary

## Decisions

### All logic inline in `+page.svelte` — no new utility functions

**Decision:** Derive all new values directly in the template using `$derived` expressions or inline template expressions.

**Rationale:** The computations are trivial (arithmetic on already-loaded data). Extracting them into a utility file adds indirection without value. If the simulator (Phase 3) is built later, shared debt-calc logic will be extracted at that point.

**Alternatives considered:** Adding helpers to `debt-calculator.ts` — rejected as over-engineering for one-liners.

---

### Direction-aware delta framing (asset vs liability)

**Decision:** Positive balance change on an asset is green (▲); the same positive change on a liability is red (▲ — balance growing). Negative change on an asset is red (▼); negative on a liability is green (▼ — balance falling / being repaid).

**Rationale:** The semantic meaning of "balance went up" differs by account category. Applying asset logic to liabilities would show "you owe more" in green, which is wrong.

**Implementation:** Gate colour class on `account.category === 'liability' ? delta > 0 ? 'text-red-700' : 'text-green-700' : delta > 0 ? 'text-green-700' : 'text-red-700'`.

---

### Guard for sparse monthly balance history

**Decision:** Show the delta strip only when sufficient history exists. 1-month delta requires `monthlyBalances.length >= 2`; 12-month delta requires `monthlyBalances.length >= 12`. Show `—` for the unavailable figure rather than hiding the strip entirely.

**Rationale:** New accounts will have little history. Hiding the strip entirely on a new account is fine; showing partial data (1-month but not 12-month) is also acceptable with a `—` placeholder.

---

### Min payment trap warning threshold: 120 months (10 years)

**Decision:** Show the warning only when `ttz.months > 120`. Do not show when `ttz.months === null` (CRITICAL — already covered by the health badge).

**Rationale:** 10 years is a clear threshold for "alarming" on consumer debt. Mortgages are a different case — this warning is intended for credit cards and personal loans. We accept some false positives on long mortgages; the user can ignore it.

---

### Cumulative interest: derived in template via running accumulator

**Decision:** Compute the running cumulative interest total inline while iterating `projection` in the `{#each}` block, using a mutable `let` counter reset before the loop.

**Rationale:** Svelte's `{#each}` allows side-effectful expressions. A `$derived` array of cumulative values is equally valid but adds boilerplate. The inline approach is consistent with how `projectionLength` is already used.

## Risks / Trade-offs

- **Long projection tables with cumulative column:** Adding a 5th column to the projection table may make it tight on narrow viewports. Accept — the terminal aesthetic already sacrifices comfort for density, and the table is inside an expandable section.
- **Min payment trap warning on mortgages:** A 25-year mortgage will always trigger this warning. This is arguably correct (mortgages are expensive) but may feel noisy. Accepted for now — can add an account-type exclusion later if needed.
- **`monthlyBalances[11]` off-by-one:** Index 11 is the 12th entry, which represents 11 months prior (most recent is index 0). Verify the month label in the delta strip reads "12 months ago" not "11 months ago" — check `monthlyBalances[11].monthStart`.
