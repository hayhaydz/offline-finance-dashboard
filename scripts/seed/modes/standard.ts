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
	openedAt: string | null;
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
	interestOverrideByName?: Record<
		string,
		{
			actualInterest?: number;
			projectedInterest?: number;
		}
	>;
	isaAllowanceOverride?: {
		usedThisTaxYear?: number;
	};
}

interface CategoryFixture {
	name: string;
	key: string;
	colour: string;
}

interface TransactionFixture {
	accountName: string;
	transactions: Array<{
		type: (typeof schema.accountTransactions.$inferInsert)["type"];
		amount: number;
		daysAgo: number;
		description: string | null;
		categoryKey?: string;
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
	const categories = loadFixture<CategoryFixture[]>("standard/categories.json");
	const transactions = loadFixture<TransactionFixture[]>(
		"standard/transactions.json",
	);
	const interestRates = loadFixture<InterestRateFixture[]>(
		"standard/interest_rates.json",
	);

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
				openedAt: a.openedAt ? new Date(a.openedAt) : null,
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

	// --- Spending Categories ---
	console.log("\n🏷️  Creating spending categories...");
	const categoryMap = new Map<string, { id: number; slug: string }>();

	for (const cat of categories) {
		const categorySlug = slug();
		await db.insert(schema.spendingCategories).values({
			slug: categorySlug,
			userId,
			name: cat.name,
			key: cat.key,
			colour: cat.colour,
			isDefault: true,
			createdAt: new Date(),
		});
		// Get the ID of the inserted category
		const inserted = await db.query.spendingCategories.findFirst({
			where: eq(schema.spendingCategories.slug, categorySlug),
			columns: { id: true, slug: true },
		});
		if (inserted) {
			categoryMap.set(cat.key, { id: inserted.id, slug: inserted.slug });
		}
		console.log(`  ✓ ${cat.name} (${cat.key})`);
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
			console.log(
				`  ⚠ Account "${t.accountName}" not found, skipping transactions`,
			);
			continue;
		}

		for (const tx of t.transactions) {
			const categoryId = tx.categoryKey
				? categoryMap.get(tx.categoryKey)?.id ?? null
				: null;
			await db.insert(schema.accountTransactions).values({
				slug: slug(),
				accountId: account.id,
				type: tx.type,
				amount: tx.amount,
				categoryId,
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
			const createdAt = new Date(
				now.getTime() - daysOffset * 24 * 60 * 60 * 1000,
			);

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

	// --- Settings ---
	console.log("\n⚙️  Seeding settings...");
	await db
		.insert(schema.settings)
		.values({ key: "boeBaseRate", value: "450" })
		.onConflictDoUpdate({ target: schema.settings.key, set: { value: "450" } });
	console.log("  ✓ boeBaseRate = 450 (4.50%)");

	// --- Monthly Reviews ---
	console.log("\n📋 Creating monthly reviews...");

	const CHECKLIST_ALL = [
		"snapshot",
		"balances",
		"isa-contributions",
		"goal-allocations",
		"interest-rates",
		"alerts",
	];

	const reviewFixtures: Array<{
		yearMonth: string;
		completedItems: string[];
		notes: string | null;
	}> = [
		{
			yearMonth: "2026-03",
			completedItems: ["snapshot", "balances"],
			notes: "Good start to the month — still need to review goals and rates.",
		},
		{
			yearMonth: "2026-02",
			completedItems: CHECKLIST_ALL,
			notes: "Full review done. ISA pacing on track for the year.",
		},
		{
			yearMonth: "2026-01",
			completedItems: CHECKLIST_ALL,
			notes: "Happy new year reset — cleared all alerts and topped up emergency fund.",
		},
		{
			yearMonth: "2025-12",
			completedItems: [
				"snapshot",
				"balances",
				"isa-contributions",
				"goal-allocations",
			],
			notes: null,
		},
		{
			yearMonth: "2025-11",
			completedItems: ["snapshot", "balances", "interest-rates"],
			notes: "Rate dropped on main savings — updated.",
		},
	];

	for (const r of reviewFixtures) {
		const createdAt = new Date(`${r.yearMonth}-05T12:00:00Z`);
		await db.insert(schema.monthlyReviews).values({
			slug: slug(),
			userId,
			yearMonth: r.yearMonth,
			completedItems: r.completedItems,
			notes: r.notes,
			createdAt,
			updatedAt: createdAt,
		});
		console.log(`  ✓ ${r.yearMonth} (${r.completedItems.length}/6 items)`);
	}

	// --- Debt Goals ---
	console.log("\n💳 Creating debt goals...");
	await seedDebtGoals(db, userId);

	const allTransactions = await db.query.accountTransactions.findMany({
		columns: { amount: true },
	});
	const netWorth = formatGBP(
		allTransactions.reduce((sum, tx) => sum + tx.amount, 0),
	);

	console.log("\n✅ [standard] Seed complete!");
	console.log(
		`   ${accounts.length} accounts | ${goals.length} goals | ${totalTransactions} transactions | ${totalRates} rates | ${snapshots.length} snapshots | ${totalNotes} notes | ${reviewFixtures.length} reviews`,
	);
	console.log(`   Net worth (latest balances): ${netWorth}`);
}

async function seedDebtGoals(db: DB, userId: number): Promise<void> {
	console.log("Seeding debt goals...");

	const liabilityAccounts = await db.query.accounts.findMany({
		where: eq(schema.accounts.category, "liability"),
	});

	console.log(`Found ${liabilityAccounts.length} liability accounts`);

	if (liabilityAccounts.length === 0) {
		console.log("No liability accounts found, skipping debt goals");
		return;
	}

	const adminUser = await db.query.users.findFirst({
		where: eq(schema.users.username, "admin"),
	});

	if (!adminUser) {
		console.log("Admin user not found, skipping debt goals");
		return;
	}

	// Helper to create debt goal with milestones
	async function createDebtGoal(
		name: string,
		slug: string,
		accountName: string,
		startingBalance: number,
		sortOrder: number,
		milestones: Array<{ label: string; threshold: number; reached: boolean }>,
		targetDate?: Date,
	) {
		const account = liabilityAccounts.find((a) => a.name === accountName);
		if (!account) {
			console.log(`  ⚠ Account "${accountName}" not found, skipping goal`);
			return null;
		}

		const now = new Date();
		const [debtGoal] = await db
			.insert(schema.goals)
			.values({
				userId: adminUser.id,
				slug,
				name,
				goalType: "debt",
				linkedAccountId: account.id,
				startingBalanceInCents: startingBalance,
				targetAmountInCents: 0,
				currentAllocation: 0,
				sortOrder,
				...(targetDate ? { targetDate } : {}),
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		console.log(`  ✓ ${name} (starting: ${formatGBP(startingBalance)})`);

		// Add milestones
		for (const ms of milestones) {
			await db.insert(schema.goalMilestones).values({
				goalId: debtGoal.id,
				label: ms.label,
				thresholdInCents: ms.threshold,
				reachedAt: ms.reached ? now : null,
				createdAt: now,
			});
		}

		return debtGoal;
	}

	// Create varied debt goals with different progress levels
	// Calculate target dates for specific goals
	const threeMonthsFromNow = new Date();
	threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

	const oneMonthFromNow = new Date();
	oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

	const twelveMonthsFromNow = new Date();
	twelveMonthsFromNow.setMonth(twelveMonthsFromNow.getMonth() + 12);

	await createDebtGoal(
		"Pay off Visa Gold",
		"pay-off-visa-gold",
		"Visa Gold",
		-250000, // Started at -£2,500
		1,
		[
			{ label: "25% paid off", threshold: -187500, reached: true },
			{ label: "Halfway there", threshold: -125000, reached: true },
			{ label: "75% paid off", threshold: -62500, reached: false },
			{ label: "Debt-free!", threshold: 0, reached: false },
		],
	);

	await createDebtGoal(
		"Clear Mastercard",
		"clear-mastercard",
		"Mastercard",
		-80000, // Started at -£800
		2,
		[
			{ label: "25% paid off", threshold: -60000, reached: true },
			{ label: "Halfway there", threshold: -40000, reached: false },
			{ label: "75% paid off", threshold: -20000, reached: false },
			{ label: "Debt-free!", threshold: 0, reached: false },
		],
	);

	await createDebtGoal(
		"Eliminate High-APR Card",
		"eliminate-high-apr-card",
		"High-APR Card",
		-100000, // Started at -£1,000
		3,
		[
			{ label: "First £100", threshold: -90000, reached: false },
			{ label: "25% paid off", threshold: -75000, reached: false },
			{ label: "Halfway there", threshold: -50000, reached: false },
			{ label: "75% paid off", threshold: -25000, reached: false },
			{ label: "Debt-free!", threshold: 0, reached: false },
		],
	);

	await createDebtGoal(
		"Pay off Tesco Car Loan",
		"pay-off-tesco-car-loan",
		"Tesco Car Loan",
		-1200000, // Started at -£12,000
		4,
		[
			{ label: "25% paid off", threshold: -900000, reached: true },
			{ label: "Halfway there", threshold: -600000, reached: false },
			{ label: "75% paid off", threshold: -300000, reached: false },
			{ label: "Loan cleared!", threshold: 0, reached: false },
		],
		twelveMonthsFromNow,
	);

	await createDebtGoal(
		"Rewards Card 0% Payoff",
		"rewards-card-zero-percent-payoff",
		"Rewards Card",
		-120000, // Started at -£1,200
		5,
		[
			{ label: "25% paid off", threshold: -90000, reached: true },
			{ label: "Halfway there", threshold: -60000, reached: false },
			{ label: "3/4 done", threshold: -30000, reached: false },
			{ label: "Paid before promo ends!", threshold: 0, reached: false },
		],
		threeMonthsFromNow,
	);

	// Add a "nearly complete" debt goal
	await createDebtGoal(
		"Final Car Loan Push",
		"final-car-loan-push",
		"Car Loan",
		-150000, // Started at -£1,500
		6,
		[
			{ label: "25% paid off", threshold: -112500, reached: true },
			{ label: "Halfway there", threshold: -75000, reached: true },
			{ label: "75% paid off", threshold: -37500, reached: true },
			{ label: "Final £100!", threshold: -10000, reached: true },
			{ label: "Debt-free!", threshold: 0, reached: false },
		],
		oneMonthFromNow,
	);

	// Add a completed debt goal for variety
	await createDebtGoal(
		"Store Card - Paid Off!",
		"store-card-paid-off",
		"High-APR Card", // Using existing account, treating as a second goal
		-50000, // Started at -£500
		7,
		[
			{ label: "25% paid off", threshold: -37500, reached: true },
			{ label: "Halfway there", threshold: -25000, reached: true },
			{ label: "75% paid off", threshold: -12500, reached: true },
			{ label: "Debt-free!", threshold: 0, reached: true },
		],
	);

	console.log(`  Created 7 debt goals with varied progress`);
}
