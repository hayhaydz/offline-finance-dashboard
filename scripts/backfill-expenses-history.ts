#!/usr/bin/env node
/**
 * Expenses History Backfill
 *
 * One-time backfill for the expenses_history table: copies the legacy global
 * `system_metadata.monthly_expenses` value (pence) into a current-month row
 * for EVERY existing user (the legacy value was global and displayed to all).
 *
 * Idempotent: a user who already has a row for the current month is skipped
 * (on-conflict-do-nothing) — re-running never duplicates or clobbers edits.
 * The legacy key is preserved (unread) for rollback.
 *
 * Usage:
 *   npx tsx scripts/backfill-expenses-history.ts
 */
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema/index.js";
import { currentMonth } from "../src/lib/utils/month-grid.js";
import { setupDb } from "./seed/lib/db.js";

const { db } = setupDb();
const month = currentMonth();

const legacy = await db.query.systemMetadata.findFirst({
	where: eq(schema.systemMetadata.key, "monthly_expenses"),
	columns: { value: true },
});

if (!legacy) {
	console.log(
		"✅ No legacy `monthly_expenses` value found — nothing to backfill (clean no-op).",
	);
	process.exit(0);
}

const amountInCents = Number.parseInt(legacy.value, 10);
if (Number.isNaN(amountInCents) || amountInCents < 0) {
	console.error(
		`❌ Legacy value "${legacy.value}" is not a valid pence amount — aborting.`,
	);
	process.exit(1);
}

const allUsers = await db.query.users.findMany({
	columns: { id: true, username: true },
});

let created = 0;
let skipped = 0;

for (const user of allUsers) {
	const result = await db
		.insert(schema.expensesHistory)
		.values({
			userId: user.id,
			month,
			monthlyExpensesInCents: amountInCents,
			note: "migrated from legacy monthly expenses setting",
		})
		.onConflictDoNothing({
			target: [schema.expensesHistory.userId, schema.expensesHistory.month],
		});

	if (result.changes > 0) {
		created++;
		console.log(
			`  ✓ ${user.username}: ${(amountInCents / 100).toFixed(2)} for ${month}`,
		);
	} else {
		skipped++;
	}
}

console.log(
	`\n✅ Backfill complete — ${created} row(s) created, ${skipped} user(s) already had a ${month} row`,
);
