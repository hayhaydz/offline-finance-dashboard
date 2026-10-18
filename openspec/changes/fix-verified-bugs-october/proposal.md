## Why

Personal-notes triage (`.docs/notes/2026-10-18/` notes 07/08/09) verified four small bugs at HEAD `2edb12d` that are each cheap to fix but annoying to live with: literal `<br>` rendered on the interest year page, `/accounts/liabilities` showing "Never pays off" for debts that do pay off, the same falsy guard in the debt projection section, and goals having no way to edit a target (over-adding past 100% is now **intended behaviour** — the user may want to keep saving past the original goal — but there is no path to raise the target or a clear "past target" state).

## What Changes

- **KpiCard `<br>` fix**: `src/routes/accounts/interest/[year]/+page.svelte:143,149` pass `<br>` inside the `detail` prop; `KpiCard.svelte:14` renders it as plain text. Replace with a plain separator (no `{@html}` — avoid XSS surface).
- **Liabilities falsy guard**: `liabilities/+page.svelte:48,75` use `liability.months &&` — `months === 0` (pays off this month) renders "Never pays off". Guard on `!== null` instead, and render a *reason* when projection is null: "No minimum payment rule set → [Set rule]" vs "Payment below interest — CRITICAL".
- **DebtProjectionSection same guard**: `DebtProjectionSection.svelte:210` — audit for the identical `months &&` falsy pattern and fix.
- **Goal target editing + over-add as intended**: over-adding stays allowed (documented decision — saving past the original goal is valid). Add: an edit-target action on `/goals/[slug]` (name + target), and a clear "past target" UI state (e.g. `REACHED +£X over` badge) instead of raw `166%`.

## Capabilities

### New Capabilities

- `goal-target-editing`: Edit a goal's name and target amount after creation, with history-preserving behaviour (progress % recomputes; debt goals keep milestones intact)

### Modified Capabilities

- `debt-projection-metrics`: Rendering requirements change — `months === 0` must show "pays off this month", not "never pays off"; null projection must distinguish missing minimum-payment rule from payment-below-interest

## Impact

- **Files**: `src/lib/components/KpiCard.svelte`, `src/routes/accounts/interest/[year]/+page.svelte`, `src/routes/accounts/liabilities/+page.svelte` + `+page.server.ts`, `src/lib/components/account/DebtProjectionSection.svelte`, `src/routes/goals/[slug]/+page.server.ts` + `+page.svelte`
- **Schema**: none
- **Tests**: extend liabilities page test for months=0 and missing-rule cases; new test for target-edit action
