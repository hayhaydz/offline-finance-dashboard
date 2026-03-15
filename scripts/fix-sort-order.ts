/**
 * One-time script to fix goal sortOrder values.
 * See: docs/scripts/one-time-scripts.md
 *
 * Usage: tsx scripts/fix-sort-order.ts
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { goals } from "../src/lib/db/schema";

async function fixSortOrder(): Promise<void> {
	const allGoals = await db.query.goals.findMany({
		where: isNull(goals.deletedAt),
		orderBy: [asc(goals.sortOrder), asc(goals.id)],
	});

	console.log(`Found ${allGoals.length} active goals`);

	await db.transaction(async (tx) => {
		for (let i = 0; i < allGoals.length; i++) {
			const goal = allGoals[i];
			await tx
				.update(goals)
				.set({ sortOrder: i + 1 })
				.where(and(eq(goals.id, goal.id), isNull(goals.deletedAt)));
			console.log(`Set sortOrder=${i + 1} for goal: ${goal.name}`);
		}
	});

	console.log("Done!");
}

fixSortOrder().catch((error) => {
	console.error(error);
	process.exit(1);
});
