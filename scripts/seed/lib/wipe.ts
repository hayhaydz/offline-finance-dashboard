import { eq, inArray } from "drizzle-orm";
import * as schema from "../../../src/lib/db/schema.js";
import type { DB } from "./db.js";

export async function wipeUserData(db: DB, userId: number): Promise<void> {
	console.log("🗑️  Wiping existing user data...");

	await db.delete(schema.snapshots).where(eq(schema.snapshots.userId, userId));

	const goals = await db.query.goals.findMany({
		where: eq(schema.goals.userId, userId),
		columns: { id: true },
	});
	if (goals.length) {
		await db.delete(schema.goalAllocations).where(
			inArray(
				schema.goalAllocations.goalId,
				goals.map((g) => g.id),
			),
		);
	}
	await db.delete(schema.goals).where(eq(schema.goals.userId, userId));

	const accounts = await db.query.accounts.findMany({
		where: eq(schema.accounts.userId, userId),
		columns: { id: true },
	});
	if (accounts.length) {
		await db.delete(schema.accountTransactions).where(
			inArray(
				schema.accountTransactions.accountId,
				accounts.map((a) => a.id),
			),
		);
		await db.delete(schema.interestRates).where(
			inArray(
				schema.interestRates.accountId,
				accounts.map((a) => a.id),
			),
		);
	}
	await db.delete(schema.accounts).where(eq(schema.accounts.userId, userId));

	console.log(
		"  ✓ Wiped accounts, transactions, rates, goals, allocations, snapshots",
	);
}
