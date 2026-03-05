#!/usr/bin/env node
/**
 * Quick test script to create accounts and transactions for slug migration testing
 */
import "dotenv/config";
import Database from "better-sqlite3-multiple-ciphers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/lib/db/schema.js";

const sqlite = new Database("storage/dev.db");
const db = drizzle(sqlite, { schema });

async function main() {
	console.log("Creating test accounts and transactions...");

	// Get admin user
	const admin = await db.query.users.findFirst({
		where: eq(schema.users.username, "admin"),
	});

	if (!admin) {
		console.error("Admin user not found. Run seed first.");
		process.exit(1);
	}

	// Create accounts
	const account1 = await db
		.insert(schema.accounts)
		.values({
			userId: admin.id,
			name: "Test Current Account",
			type: "current",
			institution: "Test Bank",
			liquidity: "instant",
			slug: null, // Null for migration
			closedAt: null,
			excludedFromNetWorth: false,
		})
		.returning();

	const account2 = await db
		.insert(schema.accounts)
		.values({
			userId: admin.id,
			name: "Test Savings Account",
			type: "savings",
			institution: "Test Bank",
			liquidity: "instant",
			slug: null, // Null for migration
			closedAt: null,
			excludedFromNetWorth: false,
		})
		.returning();

	console.log(`Created accounts: ${account1[0].id}, ${account2[0].id}`);

	// Create transactions
	const tx1 = await db
		.insert(schema.accountTransactions)
		.values({
			accountId: account1[0].id,
			type: "deposit",
			amount: 100000,
			transactionDate: new Date("2026-01-01"),
			description: "Initial deposit",
			slug: null, // Null for migration
		})
		.returning();

	const tx2 = await db
		.insert(schema.accountTransactions)
		.values({
			accountId: account1[0].id,
			type: "deposit",
			amount: 50000,
			transactionDate: new Date("2026-01-15"),
			description: "Updated deposit",
			slug: null, // Null for migration
		})
		.returning();

	console.log(`Created transactions: ${tx1[0].id}, ${tx2[0].id}`);
	console.log(
		"✅ Test data created. Run npm run migrate:slugs to generate slugs.",
	);

	sqlite.close();
}

main().catch(console.error);
