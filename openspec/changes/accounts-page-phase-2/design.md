## Context

The accounts detail page (`/accounts/[slug]`) is the primary view for a single financial account. Phase 1 shipped six data-rich additions to the header and debt projection sections. All Phase 1 features were pure client-side derivations from already-loaded data.

Phase 2 introduces four features across three different sections of the page. Three are client-side extensions with no schema changes; one (overpayment scenarios) requires additional server-side computation using the existing `calculateTTZ()` engine.

The app is offline-first, stores monetary values in pence (integers), and rates in basis points. The UK tax year runs 6 April – 5 April.

## Goals / Non-Goals

**Goals:**
- Add monthly net flow grouping to the transaction ledger (client-side, within current page)
- Surface PSA consumption progress and breach projection on savings accounts
- Project ISA allowance fill date based on deposit cadence
- Display three side-by-side overpayment scenarios for debt accounts (minimum, +25%, +50%)

**Non-Goals:**
- Cross-page transaction grouping (only the current 20-transaction page is grouped)
- Interactive/live-updating payment simulator (Phase 3.1 supersedes 2.4 if built)
- Automatic BoE rate lookup or PSA threshold configuration (manual values only)
- Schema changes — all features work with existing columns

## Decisions

### 1. Transaction grouping: client-side only, current page

**Decision:** Group the transaction list entirely in the Svelte template using a `$derived` expression — no server changes.

**Rationale:** Transactions are already paginated to 20 items. Cross-page grouping would require server aggregation and a fundamentally different data shape. The per-page group is a structural improvement with no coordination cost.

**Alternative considered:** Server-side aggregation returning pre-grouped data. Rejected — adds complexity, breaks the pagination model, and provides no meaningful benefit for a 20-item window.

---

### 2. Overpayment scenarios: server-side pre-computation

**Decision:** Compute three TTZ scenarios (minimum, +25%, +50%) in `+page.server.ts` by calling `calculateTTZ()` three times and passing results to the page as `data.overpaymentScenarios`.

**Rationale:** `calculateTTZ()` already exists and is correct. Keeping computation server-side avoids porting amortisation logic to the client. The UI stays a pure display component.

**Alternative considered:** Client-side Svelte 5 `$derived` using a ported TTZ calculation. Viable but introduces duplication risk between server and client implementations. Deferred to Phase 3.1 if an interactive simulator is built.

---

### 3. PSA projection: derive in page server, not in `interestBreakdown.ts`

**Decision:** Calculate the PSA breach month directly in `+page.server.ts` using `data.interestSummary` fields, rather than extending `interestBreakdown.ts`.

**Rationale:** The projection is a display concern for this specific page, not a reusable financial primitive. Keeping it in the page server avoids coupling the breakdown module to UI-specific projections.

---

### 4. ISA deposit cadence: average over last 3 `monthlyBalances` entries

**Decision:** Calculate average monthly deposit as `mean(monthlyBalances[0..2].closingBalance - monthlyBalances[1..3].closingBalance)` where the delta is positive (deposits only; ignore withdrawals).

**Rationale:** Three months is a short enough window to reflect recent behaviour without being distorted by one-off large deposits. `monthlyBalances` is already loaded for the balance delta strip.

**Alternative considered:** Parsing transaction history for explicit deposit transactions. Rejected — requires an additional query and is more fragile (transaction categorisation is not guaranteed).

## Risks / Trade-offs

- **Grouping splits months at page boundaries** — if a page straddles a month boundary, the first and last groups may be incomplete. Documented in spec as acceptable; no cross-page grouping is in scope.
- **Cadence-based ISA projection is a rough estimate** — three months of balance deltas is a heuristic, not a precise deposit log. The projection should be presented as indicative, not precise.
- **+25% / +50% scenarios assume current balance and rate are static** — `calculateTTZ()` uses the current balance snapshot. This is consistent with the existing projection table behaviour.
- **PSA allowance threshold is hardcoded** — £1,000 for basic rate taxpayers. The app does not track tax bands. If the threshold changes (e.g., 2024 higher-rate reduction to £500), it must be updated manually.
