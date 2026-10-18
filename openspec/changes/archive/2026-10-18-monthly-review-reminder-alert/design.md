## Context

The alerts system uses a computed pattern where alerts are generated dynamically on each page load rather than being stored in the database. The `getAlerts()` function in `src/lib/server/alerts.ts` orchestrates multiple alert checkers and returns a combined list.

Current state:
- 25+ alert types defined in `AlertType` union
- Alert checkers follow a consistent pattern: sync or async functions that return `Alert[]`
- Global alerts use `makeGlobalAlert()` helper with `id: ${type}:global`
- The `monthlyReviews` table stores reviews keyed by `yearMonth` (YYYY-MM format)

## Goals / Non-Goals

**Goals:**
- Add a reminder alert when no monthly review exists for the current calendar month
- **Escalate severity** as the month progresses to encourage timely action
- Follow existing alert patterns and conventions

**Non-Goals:**
- Configurable escalation timing (future enhancement)
- Snoozing/dismissing alerts (already handled by creating the review)

## Decisions

### 1. Alert Type Name: `NO_MONTHLY_REVIEW`
**Rationale**: Follows existing naming convention (e.g., `NO_SNAPSHOT_RECENTLY`, `NO_DISBURSEMENT`).
**Alternatives considered**:
- `MISSING_MONTHLY_REVIEW` - longer, no clearer
- `REVIEW_REMINDER` - doesn't convey "missing" aspect

### 2. Escalating Severity Schedule
**Rationale**: Graduated urgency encourages action without being annoying early in the month.
| Days | Severity | Message Tone |
|------|----------|--------------|
| 1-7 | `info` | "No review yet for [Month]" |
| 8-14 | `amber` | "Review overdue for [Month]" |
| 15+ | `red` | "Review urgently needed for [Month]" |

**Alternatives considered**:
- Static severity - either too aggressive early or too passive late
- More granular steps (e.g., every 3 days) - over-engineering

### 3. Start Immediately on Day 1
**Rationale**: Friendly reminder on the 1st establishes good habits without pressure.
**Alternatives considered**:
- 7-day grace period - delays useful reminder, user may forget

### 4. Check Location: Async user-level checker
**Rationale**: Requires database query against `monthlyReviews` table, similar to `checkSnapshotAlerts()`.
**Alternatives considered**:
- Sync checker - not possible due to DB query requirement

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Alert feels nagging if user doesn't want to do reviews | Low severity (`info`) and links directly to reviews page for easy action |
| Performance impact from additional DB query | Query is indexed on `userId, yearMonth` - minimal overhead |
