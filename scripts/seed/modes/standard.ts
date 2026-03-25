import { eq } from "drizzle-orm";
import * as schema from "../../../src/lib/db/schema.js";
import type { DB } from "../lib/db.js";
import { daysAgo, formatGBP, loadFixture, slug } from "../lib/helpers.js";
import { createSnapshot } from "../lib/snapshot.js";
import { wipeUserData } from "../lib/wipe.js";

interface AccountFixture {
	name: string;
	institution: string | null;
	type: (typeof schema.accounts.$inferInsert)["type"];
	taxWrapper: (typeof schema.accounts.$inferInsert)["taxWrapper"];
	category: "asset" | "liability";
	liquidity: (typeof schema.accounts.$inferInsert)["liquidity"];
	excludedFromNetWorth: boolean;
	closedAt: string | null;
	maturityDate: string | null;
	minimumPaymentType: (typeof schema.accounts.$inferInsert)["minimumPaymentType"];
	minimumPaymentFlat: (typeof schema.accounts.$inferInsert)["minimumPaymentFlat"];
	minimumPaymentPercentage: (typeof schema.accounts.$inferInsert)["minimumPaymentPercentage"];
	balances: Array<{
		balanceInCents: number;
		daysAgo: number;
		notes: string | null;
	}>;
}

interface GoalFixture {
	name: string;
	targetAmountInCents: number;
	isEmergencyFund: boolean;
	targetDate: string | null;
	deletedAt: string | null;
	allocations: Array<{
		accountName: string | null;
		amount: number;
		type: string;
	}>;
}

interface SnapshotFixture {
	date: string;
	multiplier: number;
	notes: string | null;
	interestOverrideByName?: Record<string, {
		actualInterest?: number;
		projectedInterest?: number;
	}>;
	isaAllowanceOverride?: {
		usedThisTaxYear?: number;
	};
}

interface TransactionFixture {
	accountName: string;
	transactions: Array<{
		type: (typeof schema.accountTransactions.$inferInsert)["type"];
		amount: number;
		daysAgo: number;
		description: string | null;
	}>;
}

interface InterestRateFixture {
	accountName: string;
	rates: Array<{
		rate: number;
		daysAgo: number;
		description: string | null;
	}>;
}

export async function seedStandard(db: DB, userId: number): Promise<void> {
	console.log("\n🌱 [standard] Starting seed...");
	await wipeUserData(db, userId);

	const accounts = loadFixture<AccountFixture[]>("standard/accounts.json");
	const goals = loadFixture<GoalFixture[]>("standard/goals.json");
	const snapshots = loadFixture<SnapshotFixture[]>("standard/snapshots.json");
	const transactions = loadFixture<TransactionFixture[]>("standard/transactions.json");
	const interestRates = loadFixture<InterestRateFixture[]>("standard/interest_rates.json");

	// --- Accounts ---
	console.log("\n📊 Creating accounts...");
	const accountByName = new Map<string, typeof schema.accounts.$inferSelect>();

	for (const a of accounts) {
		const now = new Date();
		const [account] = await db
			.insert(schema.accounts)
			.values({
				slug: slug(),
				userId,
				name: a.name,
				institution: a.institution,
				type: a.type,
				taxWrapper: a.taxWrapper,
				category: a.category,
				liquidity: a.liquidity,
				excludedFromNetWorth: a.excludedFromNetWorth,
				closedAt: a.closedAt ? new Date(a.closedAt) : null,
				maturityDate: a.maturityDate ? new Date(a.maturityDate) : null,
				minimumPaymentType: a.minimumPaymentType,
				minimumPaymentFlat: a.minimumPaymentFlat,
				minimumPaymentPercentage: a.minimumPaymentPercentage,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		accountByName.set(a.name, account);
		console.log(`  ✓ ${a.name} (${a.institution ?? "-"})`);
	}

	// --- Goals ---
	console.log("\n🎯 Creating goals...");

	for (let i = 0; i < goals.length; i++) {
		const g = goals[i];
		const [goal] = await db
			.insert(schema.goals)
			.values({
				slug: slug(),
				userId,
				name: g.name,
				targetAmountInCents: g.targetAmountInCents,
				currentAllocation: 0,
				targetDate: g.targetDate ? new Date(g.targetDate) : null,
				isEmergencyFund: g.isEmergencyFund,
				sortOrder: i,
				deletedAt: g.deletedAt ? new Date(g.deletedAt) : null,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		let total = 0;
		for (const alloc of g.allocations) {
			const account = alloc.accountName
				? accountByName.get(alloc.accountName)
				: null;
			const now = new Date();
			await db.insert(schema.goalAllocations).values({
				goalId: goal.id,
				accountId: account?.id ?? null,
				amount: alloc.amount,
				type: alloc.type,
				allocationDate: now,
				createdAt: now,
			});
			total += alloc.amount;
		}

		await db
			.update(schema.goals)
			.set({ currentAllocation: total })
			.where(eq(schema.goals.id, goal.id));

		const pct = Math.round((total / g.targetAmountInCents) * 100);
		console.log(`  ✓ ${g.name} (${pct}%)`);
	}

	// --- Transactions ---
	console.log("\n💸 Creating transactions...");
	let totalTransactions = 0;

	for (const t of transactions) {
		const account = accountByName.get(t.accountName);
		if (!account) {
			console.log(`  ⚠ Account "${t.accountName}" not found, skipping transactions`);
			continue;
		}

		for (const tx of t.transactions) {
			await db.insert(schema.accountTransactions).values({
				slug: slug(),
				accountId: account.id,
				type: tx.type,
				amount: tx.amount,
				description: tx.description,
				transactionDate: daysAgo(tx.daysAgo),
				createdAt: new Date(),
			});
			totalTransactions++;
		}

		console.log(`  ✓ ${t.accountName} (${t.transactions.length} transactions)`);
	}

	// --- Interest Rates ---
	console.log("\n📈 Creating interest rates...");
	let totalRates = 0;

	for (const r of interestRates) {
		const account = accountByName.get(r.accountName);
		if (!account) {
			console.log(`  ⚠ Account "${r.accountName}" not found, skipping rates`);
			continue;
		}

		for (const rate of r.rates) {
			await db.insert(schema.interestRates).values({
				accountId: account.id,
				rate: rate.rate,
				effectiveFrom: daysAgo(rate.daysAgo),
				createdAt: new Date(),
			});
			totalRates++;
		}

		console.log(`  ✓ ${r.accountName} (${r.rates.length} rates)`);
	}

	// --- Account Notes ---
	console.log("\n📝 Creating account notes...");
	let totalNotes = 0;

	// Define realistic note patterns for different account types
	const notePatterns: Record<string, string[]> = {
		"Main Current": [
			"Main day-to-day spending account. Salary arrives on 25th of each month.",
			"Remember to check direct debits quarterly.",
		],
		"Emergency Fund": [
			"Emergency fund target: 6 months of expenses.",
			"Only use for genuine emergencies - not holidays or luxuries.",
		],
		"Stocks & Shares ISA": [
			"£20k ISA allowance used for 2025/26 tax year.",
			"High growth strategy - Vanguard funds. Review annually.",
		],
		"Visa Gold": [
			"Pay off in full each month to avoid interest.",
			"Main spending card for groceries and everyday purchases.",
		],
		"Tesco Car Loan": [
			"Fixed monthly payment: ~£350 on 15th of each month.",
			"Remaining balance: ~£11,200 as of Jan 2025.",
		],
		"Home Mortgage": [
			"Tracker rate: 6.25% (base rate + 0.25%).",
			"Consider overpaying when possible to reduce interest.",
		],
		"Rewards Card": [
			"0% promotional period until May 2026.",
			"Pay off full balance before promo ends to avoid interest.",
		],
	};

	for (const [accountName, notes] of Object.entries(notePatterns)) {
		const account = accountByName.get(accountName);
		if (!account) continue;

		for (const content of notes) {
			const now = new Date();
			// Stagger note creation times for realism
			const daysOffset = Math.floor(Math.random() * 90);
			const createdAt = new Date(now.getTime() - daysOffset * 24 * 60 * 60 * 1000);

			await db.insert(schema.accountNotes).values({
				slug: slug(),
				userId,
				accountId: account.id,
				content,
				createdAt,
			});
			totalNotes++;
		}
	}

	console.log(`  ✓ ${totalNotes} notes created`);

	// --- Snapshots ---
	console.log("\n📸 Creating snapshots...");

	for (const snap of snapshots) {
		await createSnapshot(db, userId, snap.date, snap.multiplier, snap.notes, {
			interestOverrideByName: snap.interestOverrideByName,
			isaAllowanceOverride: snap.isaAllowanceOverride,
		});
		console.log(`  ✓ ${snap.date}`);
	}

	const allTransactions = await db.query.accountTransactions.findMany({
		columns: { amount: true },
	});
	const netWorth = formatGBP(allTransactions.reduce((sum, tx) => sum + tx.amount, 0));

	console.log("\n✅ [standard] Seed complete!");
	console.log(
		`   ${accounts.length} accounts | ${goals.length} goals | ${totalTransactions} transactions | ${totalRates} rates | ${snapshots.length} snapshots | ${totalNotes} notes`,
	);
	console.log(`   Net worth (latest balances): ${netWorth}`);
}
