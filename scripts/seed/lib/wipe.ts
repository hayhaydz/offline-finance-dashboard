import { eq, inArray } from "drizzle-orm";
import * as schema from "../../../src/lib/db/schema/index";
import type { DB } from "./db.js";

export async function wipeUserData(db: DB, userId: number): Promise<void> {
	console.log("🗑️  Wiping existing user data...");

	// Budget amendments reference budget months — clear the trail first
	const budgetRows = await db.query.budgetMonths.findMany({
		where: eq(schema.budgetMonths.userId, userId),
		columns: { id: true },
	});
	if (budgetRows.length) {
		await db.delete(schema.budgetConfigAmendments).where(
			inArray(
				schema.budgetConfigAmendments.budgetMonthId,
				budgetRows.map((b) => b.id),
			),
		);
	}
	await db
		.delete(schema.budgetMonths)
		.where(eq(schema.budgetMonths.userId, userId));

	await db.delete(schema.snapshots).where(eq(schema.snapshots.userId, userId));
	await db
		.delete(schema.taxBandHistory)
		.where(eq(schema.taxBandHistory.userId, userId));
	await db
		.delete(schema.incomeHistory)
		.where(eq(schema.incomeHistory.userId, userId));

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
		"  ✓ Wiped budgets, amendments, accounts, transactions, rates, goals, allocations, snapshots, tax bands, income history",
	);
}
