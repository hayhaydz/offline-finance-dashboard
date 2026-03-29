## Context

The accounts detail page has now received three phases of improvements. Phase 3 introduced the overpayment simulator (client-side `calculateTTZ()` reuse), the `settings` table (BoE base rate), and `openedAt` on accounts. Phase 4 tackles the four exploratory items from the roadmap: a rate-change stress test, cross-account payoff strategy hints, recurring transaction detection, and a break-even month marker in the projection table.

The app is offline-first SvelteKit + Drizzle ORM (SQLite). Monetary values are pence; rates are basis points. `calculateTTZ()` is the shared debt math engine in `src/lib/utils/debt-calculator.ts`. The overpayment simulator (Phase 3) already imports and calls it client-side.

## Goals / Non-Goals

**Goals:**
- Rate change stress test: show TTZ and interest impact at +2% / +5% rate scenarios (static rows, not interactive — see Decisions)
- Debt payoff strategy tip: cross-account query to surface avalanche or snowball priority for the current debt account
- Recurring transaction detection: server-side pattern matching over full transaction history, passive inline notes in ledger
- Break-even month marker: annotation on the projection table row where cumulative interest exceeds `originalPrincipal`

**Non-Goals:**
- Interactive rate input (the static stress-test rows are sufficient; full rate simulator adds complexity for marginal gain)
- Automatic rate data fetching or external API integration
- Persisting recurring transaction patterns or letting users confirm/dismiss them
- Cross-account aggregate views or portfolio-level analysis beyond the one-line tip
- Modifications to `originalPrincipal` — it already exists in schema as a nullable integer (pence)

## Decisions

### 1. Rate change stress test is static rows, not an interactive input

**Decision:** Render two pre-computed scenario rows at +200bp and +500bp above the current rate, calculated server-side in `+page.server.ts`.

**Rationale:** The Phase 3 overpayment simulator already covers "what if I pay more?" interactivity. Adding a rate input would duplicate the simulator's visual pattern and complicate the layout. Static rows at +2%/+5% cover the most realistic stress scenarios (BoE rate movements) without requiring client-side rate recalculation logic. Server-side computation keeps the Svelte component clean.

**Alternative considered:** Interactive rate slider — rejected; two static rows answer the user's real question ("how bad could this get?") without added complexity.

### 2. Cross-account payoff strategy is a server-side query, single-line tip

**Decision:** In `+page.server.ts`, query all liability accounts for the current user. Compute avalanche priority (highest rate first) and snowball priority (lowest balance first). Surface as a single-line contextual tip on the current account's projection section.

**Rationale:** The query is simple (one extra SELECT); no new tables needed. A one-line tip is actionable without being prescriptive — it tells the user where this account sits, not what to do. Fetching all liabilities server-side keeps the component stateless.

**Alternative considered:** Client-side fetch of sibling accounts — rejected; introduces an extra API call and timing complexity when server has all data at load time.

### 3. Recurring transaction detection is server-side grouping, passive display only

**Decision:** In `+page.server.ts`, query the full transaction history for the account (not just current page). Group by `LOWER(TRIM(description))` and count rows with similar amounts (within ±10%) and regular date spacing (monthly cadence = 28–31 day gaps between 3+ occurrences). Surface as a separate `recurringPatterns` array; display inline in the ledger above the transaction list, not per-row.

**Rationale:** Client-side pattern matching over paginated data is impossible — you only see the current page. A server-side pre-pass over full history is the only correct approach. Passive display (not per-row annotation) avoids visual noise. Grouping at load time is acceptable given typical transaction volumes (hundreds, not millions).

**Alternative considered:** Per-row "recurring" badge — rejected; clutters the ledger and requires matching at render time.

**False positive mitigation:** Require ≥ 3 occurrences, amount within ±10%, and ≥ 2 gaps in the 28–35 day range. Suppress if description is empty or very short (≤ 3 characters).

### 4. Break-even month uses cumulative interest running total, server-side index

**Decision:** In `+page.server.ts`, compute `breakEvenMonthIndex` as the first projection row index where cumulative interest ≥ `account.originalPrincipal`. Pass this index to the template; the projection table highlights that row.

**Rationale:** The cumulative interest is already derived client-side in the projection table (Phase 1.5). The break-even index can be computed once server-side from the same `data.projection` array; no new query needed. Passing an index keeps the template logic trivial.

**Only applies when:** `account.originalPrincipal` is non-null and non-zero.

## Risks / Trade-offs

- **[Risk] Rate stress test uses current balance, not original — TTZ for +5% may be very high** → This is correct and intentional; the stress test shows reality. Cap displayed TTZ at "300+ months" to avoid absurd numbers.
- **[Risk] Cross-account query leaks data if RLS is missing** → Query MUST use `withUserFilter(locals.user.id, accounts)` — same pattern as all other account queries. This is a hard constraint.
- **[Risk] Recurring detection produces false positives on varied-amount recurring bills** → The ±10% amount tolerance and ≥ 3 occurrence requirement reduces false positives. Accept some misses (strict) over false positives (lenient).
- **[Risk] Break-even month only meaningful for installment loans** → Guard with `account.originalPrincipal != null`. For revolving debt (credit cards), `originalPrincipal` is null — the feature is hidden.
- **[Trade-off] Full transaction history query for recurring detection adds load time** → Acceptable for personal finance volumes. If it becomes a problem, add a server-side cache or limit to last 24 months.

## Migration Plan

No schema changes required. All features are purely additive to server load functions and client template:

1. Update `src/routes/accounts/[slug]/+page.server.ts`:
   - Add rate scenario calculation (`rateScenarios` array, two entries)
   - Add cross-account liabilities query (`liabilityContext` object with current account's payoff rank)
   - Add recurring patterns query (`recurringPatterns` array)
   - Add break-even index computation (`breakEvenMonthIndex`)
2. Update `src/routes/accounts/[slug]/+page.svelte`:
   - Render rate scenario rows in debt projection section
   - Render payoff strategy tip in debt projection section
   - Render recurring pattern notes above ledger
   - Annotate break-even row in projection table
3. No `db:push` required — no schema changes
4. No `seed.ts` update required — no new tables/fields
