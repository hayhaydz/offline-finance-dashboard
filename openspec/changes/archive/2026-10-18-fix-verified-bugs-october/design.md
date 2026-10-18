## Context

Four verified bugs from `.docs/notes/2026-10-18/` (notes 07/08/09): literal `<br>` in KpiCard detail text (`src/lib/components/KpiCard.svelte:14` renders `{detail}` as plain text while `interest/[year]/+page.svelte:143,149` pass `<br>`), falsy `months &&` guards treating `months === 0` as "never pays off" (`liabilities/+page.svelte:48,75`, `DebtProjectionSection.svelte:210`), and goals having no target-editing path while over-adding past 100% is now confirmed intended behaviour.

## Goals / Non-Goals

**Goals:**
- Interest year KPI details render on one line with a clean separator
- `months === 0` shows "pays off this month"; null projection shows *why*
- Goals can edit name/target; over-add remains allowed with a clear "past target" state

**Non-Goals:**
- Over-add rejection or clamping (explicitly rejected by user — saving past a goal is valid)
- Budget-spending semantics (see `transaction-taxonomy` change)
- Minimum-payment rule *editing* UI (only a link to the existing edit page)

## Decisions

1. **Plain-text separator, not `{@html}`** — KpiCard gains no HTML rendering; the interest page passes `" · "` between TAXABLE and TAX-FREE. Avoids XSS surface for zero gain.
2. **Null-projection reason taxonomy** — server returns `projectionNullReason: "no_minimum_payment" | "payment_below_interest" | null` alongside TTZ. UI: no-rule → "No minimum payment set [Set rule →]" linking to account edit; below-interest → "Payment below interest — CRITICAL" in red (matching the existing `[CRITICAL]` badge, fixing the amber/red inconsistency noted in note 08).
3. **Target edit scope** — name + targetAmount only (dates/type out of scope). Progress recomputes from existing allocation; debt goals keep milestones but milestone completion recalculates naturally. Audit's dead-action cleanup (`addMoney`/`withdrawMoney` on goal detail) is left to the audit backlog, not folded in here.
4. **Past-target UI** — above 100%, progress line shows `REACHED — £X over target` in green instead of a raw percentage.

## Risks / Trade-offs

- [Reason taxonomy changes page-data shape] → keep `projectionNullReason` optional so existing consumers/tests of `months`/`years` are unaffected.
- [Target reduction below current allocation] → reject with "target below current allocation £X" (money already earmarked can't become over-target by edit).
