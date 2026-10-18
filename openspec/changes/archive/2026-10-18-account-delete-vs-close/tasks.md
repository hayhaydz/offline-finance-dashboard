## 1. Schema + existence semantics

- [x] 1.1 Add `accounts.deletedAt` (nullable timestamp) via `db:push`; update `scripts/seed.ts` (one closed-with-history example)
- [x] 1.2 Sweep all queries using `closedAt IS NULL` to mean *existence*: migrate to `deletedAt IS NULL`; keep `closedAt` only for openness/placement/history semantics; document the split in the schema comment
- [x] 1.3 Test matrix per query family: deleted accounts invisible everywhere; closed accounts invisible in open lists but present in interest/ISA/tax-year history

## 2. Empty-accounts-only delete flow

- [x] 2.1 Confirmation page (typed disclosure: name, note count, rate-history presence); no native `confirm()`; server-side `transactionCount === 0` gate enforced at action time
- [x] 2.2 Atomic delete action: hard row delete of account + notes + rate history in one transaction; defensive goal-allocation check; `validateUserAccess`; logger (counts only)
- [x] 2.3 `[Delete account]` affordance on account detail only when `transactionCount === 0`; accounts with history see close-instead guidance; visually and verbally distinct from `[Close account]`

## 3. Closed-account placement

- [x] 3.1 Accounts index: per type section, open accounts first + collapsed `[Show N closed]` toggle (localStorage persistence)
- [x] 3.2 Close-account flow renders success/failure feedback (audit #10)

## 4. QA

- [x] 4.1 Tests: empty-only gate (refusal with history, server-side), atomicity, cross-user rejection, placement order, history integrity for closed accounts
- [x] 4.2 `npm run check` + `npm test`; update `.docs/VERSION_HISTORY.md`
