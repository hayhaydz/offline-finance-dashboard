## Context

The accounts detail page (`/accounts/[slug]`) has grown through Phases 1 and 2 with static metrics and read-only projections for debt, savings, and ISA accounts. Phase 3 introduces interactivity (the overpayment simulator), a new schema field (`openedAt`), and a new settings table for the BoE base rate.

The app is an offline-first personal finance dashboard using SvelteKit, Drizzle ORM (SQLite), and Svelte 5 runes. Monetary values are stored as pence (integer); interest rates as basis points (integer). The `calculateTTZ()` function in `src/lib/utils/debt-calculator.ts` is the core debt math engine.

## Goals / Non-Goals

**Goals:**
- Inline overpayment simulator on debt accounts (live, client-side TTZ recalculation)
- `openedAt` nullable timestamp on accounts — displayed in header, editable in account form
- `settings` table with BoE base rate — spread calculation displayed near interest rate

**Non-Goals:**
- Automatic BoE rate fetching from an external API (manual update only)
- Cross-account debt comparison or snowball/avalanche logic (Phase 4)
- Persisting simulator scenarios or user-entered values across sessions

## Decisions

### 1. Overpayment simulator is pure client-side

**Decision:** Port `calculateTTZ()` logic to a Svelte 5 `$derived` expression in `+page.svelte`. Do not make a server round-trip per keystroke.

**Rationale:** The math is ~30 lines. Client-side gives instant feedback; server round-trips would add latency and complexity for no benefit. The existing `calculateTTZ()` function is already framework-agnostic TypeScript — it can be imported directly into the Svelte component without modification.

**Alternative considered:** Server action with debounce — rejected; adds network dependency to a fundamentally local calculation.

### 2. `openedAt` is a nullable timestamp on accounts

**Decision:** Add `openedAt: integer("opened_at", { mode: "timestamp" })` (nullable) to the accounts table.

**Rationale:** Existing accounts won't have this data; null is the correct representation. Distinct from `createdAt` (when added to dashboard). No default value — the field should be deliberately set.

**Alternative considered:** Separate metadata table — overkill for a single nullable field.

### 3. BoE base rate stored in a `settings` table

**Decision:** New `settings` table with `key TEXT PK, value TEXT NOT NULL, updatedAt TIMESTAMP`. BoE rate stored as basis points under key `"boeBaseRate"`.

**Rationale:** Basis points avoids floating-point precision issues (consistent with all other rate storage). A general `settings` table is useful beyond this feature (future app-wide config). Storing as text allows future non-numeric settings.

**Alternative considered:** Column on a config singleton row — less extensible; a key-value table is standard for app config.

### 4. BoE spread sign convention

**Decision:** Spread = `accountRate - baseRate` (signed, in basis points). Positive spread on a liability = above market (bad); negative spread on an asset = below market (bad).

**Rationale:** Consistent, unambiguous formula. UI handles the semantic labelling per account category.

## Risks / Trade-offs

- **[Risk] Simulator diverges from server TTZ** → The server uses `calculateTTZ()` directly; client imports the same function. Drift is only possible if the function is changed without updating the import — mitigated by using a shared module.
- **[Risk] `openedAt` is never populated** → Nullable by design; UI gracefully hides it when null. No data quality risk.
- **[Risk] BoE rate goes stale** → Manual update is intentional (matches app's offline-first philosophy). No mitigation needed; staleness is visible to the user if they know the current rate.
- **[Trade-off] Settings table is general but untyped** → Value is `TEXT`; type coercion happens at read time. Acceptable for a small config store; if more structured config is needed later, a typed approach should be revisited.

## Migration Plan

1. Add `openedAt` to `src/lib/db/schema.ts`
2. Add `settings` table to `src/lib/db/schema.ts`
3. Run `npm run db:push` (direct push, active dev phase)
4. Update `scripts/seed.ts` with example `openedAt` values and a seed BoE rate row
5. No rollback complexity — both fields/tables are purely additive
