# Row-Level Security (RLS) Patterns

This project uses application-level row-level security to ensure users can only access their own data. SQLite does not support database-level RLS policies (unlike PostgreSQL), so every query on a user-scoped table **must** include a user filter at the application layer.

All RLS utilities live in `src/lib/auth/row-security.ts`.

---

## Core Pattern: `withUserFilter`

The primary defence. Adds a `WHERE user_id = ?` condition to Drizzle queries.

```typescript
import { withUserFilter } from "$lib/auth/row-security";
import { accounts } from "$lib/db/schema";
import { db } from "$lib/db";

// Basic: load all of a user's accounts
const userAccounts = await db.query.accounts.findMany({
    where: withUserFilter(locals.user.id, accounts),
});

// Combined with other conditions
import { and, isNull } from "drizzle-orm";
const openAccounts = await db.query.accounts.findMany({
    where: and(
        withUserFilter(locals.user.id, accounts),
        isNull(accounts.closedAt),
    ),
});
```

### Convenience: `andWithUserFilter`

Combines user filtering with additional conditions in one call:

```typescript
import { andWithUserFilter } from "$lib/auth/row-security";
import { isNull } from "drizzle-orm";

const openAccounts = await db.query.accounts.findMany({
    where: andWithUserFilter(locals.user.id, accounts, isNull(accounts.closedAt)),
});
```

---

## Ownership Verification

### `validateUserAccess` (throws on mismatch)

Use when loading a single resource by slug or ID. Asserts ownership and throws an error if the user doesn't own the resource.

```typescript
import { validateUserAccess } from "$lib/auth/row-security";

const snapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.slug, params.slug),
});

if (!snapshot) throw error(404, "Not found");

// Throws if snapshot.userId !== locals.user.id
validateUserAccess(snapshot, locals.user, "Snapshot");
```

The function uses TypeScript assertion signatures, so after calling it the compiler knows the resource is non-null.

### `checkUserAccess` (returns boolean)

Non-throwing version for conditional logic:

```typescript
import { checkUserAccess } from "$lib/auth/row-security";

const account = await db.query.accounts.findFirst({
    where: eq(accounts.slug, params.slug),
});

if (!checkUserAccess(account, locals.user)) {
    // Handle unauthorised access without throwing
    return { status: 403 };
}
// account is now typed as non-null
```

### `validateAllUserAccess` (batch check)

Throws if **any** item in an array doesn't belong to the user:

```typescript
import { validateAllUserAccess } from "$lib/auth/row-security";

const goals = await db.query.goals.findMany({
    where: inArray(goals.id, goalIds),
});

// Throws if any goal belongs to a different user
validateAllUserAccess(goals, locals.user, "Goal");
```

---

## Anti-Patterns to Avoid

### Missing user filter on `findMany`

```typescript
// WRONG: Returns ALL accounts for ALL users
const accounts = await db.query.accounts.findMany();
```

### Trusting slug without ownership check

```typescript
// WRONG: Any authenticated user can access any slug
const snapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.slug, params.slug),
});
// No validateUserAccess call!
```

### Filtering by `userId` directly instead of `withUserFilter`

```typescript
// WORKS but inconsistent -- use withUserFilter for the standard pattern
const accounts = await db.query.accounts.findMany({
    where: eq(accounts.userId, locals.user.id),
});
```

Using the helper ensures consistent patterns across the codebase and makes it easy to audit for missing RLS by grepping for `withUserFilter`.

---

## User-Scoped Tables

These tables contain a `userId` column and require RLS on every query:

| Table | Schema Export | Notes |
|-------|--------------|-------|
| `accounts` | `accounts` | Top-level user resource |
| `accountTransactions` | `accountTransactions` | Scoped via `accounts` (no direct `userId`) |
| `interestRates` | `interestRates` | Scoped via `accounts` (no direct `userId`) |
| `accountNotes` | `accountNotes` | Scoped via `accounts` (no direct `userId`) |
| `goals` | `goals` | Top-level user resource |
| `goalAllocations` | `goalAllocations` | Scoped via `goals` (no direct `userId`) |
| `goalMilestones` | `goalMilestones` | Scoped via `goals` (no direct `userId`) |
| `snapshots` | `snapshots` | Top-level user resource |
| `monthlyReviews` | `monthlyReviews` | Top-level user resource |
| `spendingCategories` | `spendingCategories` | Top-level user resource |
| `budgetMonths` | `budgetMonths` | Top-level user resource |
| `sessions` | `sessions` | Has `userId` but managed by auth layer |
| `backupCodes` | `backupCodes` | Has `userId` but managed by auth layer |

Tables **without** a `userId` column (no RLS needed):
- `users` -- looked up by session token, not filtered
- `loginAttempts` -- keyed by username, rate-limiting only
- `systemMetadata` -- global key-value store
- `settings` -- global key-value store

### Direct vs Indirect Scoping

Tables with a direct `userId` column use `withUserFilter`:

```typescript
where: withUserFilter(locals.user.id, goals)
```

Tables scoped through a parent (e.g., `accountTransactions` via `accounts`) should verify the parent's ownership first, then query the child:

```typescript
const account = await db.query.accounts.findFirst({
    where: eq(accounts.slug, params.slug),
});
validateUserAccess(account, locals.user, "Account");

// Now safe to query transactions for this account
const transactions = await db.query.accountTransactions.findMany({
    where: eq(accountTransactions.accountId, account.id),
});
```

---

## Checklist for New Features

Before merging any feature that touches the database:

- [ ] All `findMany` / `findFirst` queries on user-scoped tables use `withUserFilter`
- [ ] All `select` queries include `.where(withUserFilter(...))`
- [ ] Resources loaded by slug/ID are verified with `validateUserAccess`
- [ ] Batch operations verify all items with `validateAllUserAccess`
- [ ] Indirectly-scoped tables (transactions, rates, notes) verify parent ownership
- [ ] No raw `eq(table.userId, locals.user.id)` -- use `withUserFilter` instead
- [ ] New user-scoped tables are added to the list above
