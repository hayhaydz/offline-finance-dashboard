## Context

`AlertBadge.svelte:62-65` links only when an alert sets `href`; unmatched-transfer alerts (`alerts/async-accounts.ts:305+`) and most computed alerts set none (note 10). Existing specs: alerts have no spec coverage yet.

## Goals / Non-Goals

**Goals:**
- URL convention for alert deep links (no IDs in URLs — slugs + query filters)
- Unmatched-transfer alerts link to the affected ledger(s), prefiltered
- Every actionable alert type sets `href`; non-actionable ones documented as intentionally linkless
- Ledger honours `type` + `month` query prefilter params

**Non-Goals:**
- Alert snooze/acknowledge (parked in note 10)
- New alert types; changing alert severity logic
- Cross-account "unmatched transfers" landing page (per-account prefilters suffice)

## Decisions

1. **Convention: alert `href` = destination that resolves or inspects the alert** — account alerts → `/accounts/[slug]?month=YYYY-MM&type=…`; budget alerts → `/overview/budgets/[month]`; ISA alerts → `/accounts/isa`; goal alerts → `/goals/[slug]`. Goal/account slugs already exist; no numeric IDs in URLs.
2. **Unmatched transfer links** — the alert computes both sides it examined; `href` points at the `transfer_in` account's ledger with `?type=transfer_in&month=YYYY-MM`; a secondary link targets the counterpart candidate account if one is guessable (same amount window). Keep it to ≤2 links per alert.
3. **Ledger prefilter params** — `type` filters the month's rows client-side (rows already loaded for the month); `month` is owned by `month-keyed-pagination` and consumed as-is here. Params never persist in stored state.
4. **Per-type audit as a task artefact** — a table in the tasks (`alert type → href | none-why`) reviewed during implementation; "informational" alerts (e.g. market note) render without link deliberately.

## Risks / Trade-offs

- [Param coupling with month-keyed-pagination] → sequence after it (or align param names now: `month`, `type`); noted in tasks.
- [Prefilter hides the full month silently] → prefiltered view renders an explicit `[Type: transfer_in] — [Clear]` chip so the filter is visible and removable.

## Migration Plan

Additive: alert builders set `href`; ledger reads optional params. Rollback = revert.
