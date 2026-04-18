import { eq } from "drizzle-orm";
import * as schema from "../../../src/lib/db/schema/index";
import type { DB } from "../lib/db.js";
import { daysAgo, randomBetween, slug } from "../lib/helpers.js";
import { wipeUserData } from "../lib/wipe.js";

const ACCOUNT_TYPES = [
	"current",
	"savings",
	"investment",
	"credit-card",
	"loan",
	"mortgage",
] as const;

const MAX_SAFE = 9_007_199_254_740_991;

function stressAccountName(i: number): string {
	return `Stress Account ${String(i + 1).padStart(2, "0")}`;
}

export async function seedStress(db: DB, userId: number): Promise<void> {
	console.log("\n💥 [stress] Starting seed...");
	await wipeUserData(db, userId);

	// ─── Accounts ────────────────────────────────────────────────────────────

	console.log("\n📊 Creating 50 stress accounts...");

	const createdAccountIds: number[] = [];
	let stressPaginationAccountId = 0; // account that will get 500 transaction entries

	// 30 normal accounts (5 per type)
	for (let t = 0; t < ACCOUNT_TYPES.length; t++) {
		const type = ACCOUNT_TYPES[t];
		const isLiability =
			type === "credit-card" || type === "loan" || type === "mortgage";
		for (let i = 0; i < 5; i++) {
			const now = new Date();
			const [account] = await db
				.insert(schema.accounts)
				.values({
					slug: slug(),
					userId,
					name: stressAccountName(t * 5 + i),
					institution: i < 3 ? "Stress Bank" : null,
					type,
					taxWrapper: "none",
					category: isLiability ? "liability" : "asset",
					liquidity: isLiability ? "locked" : "instant",
					excludedFromNetWorth: false,
					closedAt: null,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			createdAccountIds.push(account.id);
			// First current account gets 500 entries
			if (t === 0 && i === 0) stressPaginationAccountId = account.id;
		}
	}

	// Special name accounts (3)
	const specialAccounts = [
		{ name: "A", type: "savings" as const, category: "asset" as const },
		{
			name: "A".repeat(200),
			type: "savings" as const,
			category: "asset" as const,
		},
		{
			name: "Háček & Ñoño <script>alert(1)</script> £€$",
			type: "current" as const,
			category: "asset" as const,
		},
	];
	for (const sa of specialAccounts) {
		const now = new Date();
		const [account] = await db
			.insert(schema.accounts)
			.values({
				slug: slug(),
				userId,
				name: sa.name,
				institution: null,
				type: sa.type,
				taxWrapper: "none",
				category: sa.category,
				liquidity: "instant",
				excludedFromNetWorth: false,
				closedAt: null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		createdAccountIds.push(account.id);
	}

	// 7 excluded accounts (5 asset + 2 liability)
	for (let i = 0; i < 7; i++) {
		const isLiability = i >= 5;
		const now = new Date();
		const [account] = await db
			.insert(schema.accounts)
			.values({
				slug: slug(),
				userId,
				name: `Excluded Account ${i + 1}`,
				institution: null,
				type: isLiability ? "loan" : "investment",
				taxWrapper: "none",
				category: isLiability ? "liability" : "asset",
				liquidity: "locked",
				excludedFromNetWorth: true,
				closedAt: null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		createdAccountIds.push(account.id);
	}

	// 10 closed accounts
	for (let i = 0; i < 10; i++) {
		const now = new Date();
		await db.insert(schema.accounts).values({
			slug: slug(),
			userId,
			name: `Closed Account ${i + 1}`,
			institution: i < 5 ? "Closed Bank" : null,
			type: "savings",
			taxWrapper: "none",
			category: "asset",
			liquidity: "instant",
			excludedFromNetWorth: false,
			closedAt: new Date("2024-01-01"),
			createdAt: now,
			updatedAt: now,
		});
	}

	console.log(`  ✓ 50 accounts created`);

	// ─── Account Notes (Stress Volume) ─────────────────────────────────────────
	console.log("\n📝 Creating stress volume account notes...");

	let totalNotes = 0;
	const stressNoteAccountId = createdAccountIds[1]; // Second account for heavy notes

	// 50 notes on one account (tests pagination)
	const noteContents = [
		"Remember to check monthly statements",
		"Review interest rate in April",
		"Consider switching to higher yield account",
		"Tax year planning: review ISA allowances",
		"Emergency fund target: 6 months expenses",
		"Automated transfer set up for 1st of month",
		"Monitor fees and charges quarterly",
		"Check for unclaimed dormant account fees",
		"Update beneficiaries after life events",
		"Review overdraft limit annually",
		"Note: minimum balance fee waiver requires £1500/mo",
		"Reminder: premium services cost £5/mo",
		"Contact support for joint account upgrade",
		"Mobile app deposit limit: £500/day",
		"Direct debit setup for utilities",
		"Standing order for savings transfer",
		"Alert threshold: low balance < £100",
		"Card blocked temporarily - call to unblock",
		"New card issued: expires 2027",
		"PIN reminder: never share with anyone",
		"Contactless limit: £100 per transaction",
		"International transaction fee: 2.99%",
		"Cash withdrawal limit: £500/day",
		"Online banking access code saved securely",
		"Two-factor authentication enabled",
		"Statement available from 1st of each month",
		"Tax statement: request in January",
		"Interest credited monthly on 25th",
		"Account opened: original deposit £1000",
		"Joint owner: full access permissions",
		"Power of attorney registered",
		"Deceased account marker removed - active",
		"Dormancy warning: activity within 12 months required",
		"Account tier: Silver (upgrade to Gold at £50k)",
		"Relationship manager: unavailable for this tier",
		"Branch counter visits limited to 3/month free",
		"Phone banking priority queue: Silver tier",
		"Travel notice required for international use",
		"Free card replacement: once per year",
		"Premium card fee waived first year",
		"Cashback on groceries: 1% (ends March)",
		"Reward points expiry: December 2026",
		"Refer-a-friend bonus: £50 per successful referral",
		"Student status verified - fee waiver until 2027",
		"Graduate account upgrade pending",
		"Overdraft arranged: £2000 interest-free",
		"Credit score impact: on-time payments help",
		"Debt consolidation loan considered",
		"Balance transfer offer: 0% for 12 months",
		"Minimum payment: 2% or £5, whichever is higher",
		"Statement balance vs current balance differs",
		"Pending transactions: not yet posted",
		"Available credit vs credit limit distinction",
		"Grace period: 25 days from statement date",
		"Late fee: £12 if payment received after due date",
		"Returned payment fee: £12 for insufficient funds",
	];

	for (const content of noteContents) {
		const now = new Date();
		// Stagger note creation over time
		const daysOffset = Math.floor(Math.random() * 365);
		const createdAt = new Date(
			now.getTime() - daysOffset * 24 * 60 * 60 * 1000,
		);

		await db.insert(schema.accountNotes).values({
			slug: slug(),
			userId,
			accountId: stressNoteAccountId,
			content,
			createdAt,
		});
		totalNotes++;
	}

	// Add 1-3 notes to most other accounts for variety
	for (let i = 0; i < Math.min(20, createdAccountIds.length); i++) {
		const accountId = createdAccountIds[i + 5];
		if (!accountId) continue;

		const noteCount = randomBetween(1, 3);
		for (let j = 0; j < noteCount; j++) {
			const now = new Date();
			const daysOffset = randomBetween(1, 180);
			const createdAt = new Date(
				now.getTime() - daysOffset * 24 * 60 * 60 * 1000,
			);

			await db.insert(schema.accountNotes).values({
				slug: slug(),
				userId,
				accountId,
				content: `Stress test note ${j + 1} for account ${i + 1}`,
				createdAt,
			});
			totalNotes++;
		}
	}

	console.log(
		`  ✓ ${totalNotes} notes created (50+ on one account for pagination)`,
	);

	// ─── Account Transactions ──────────────────────────────────────────────────

	console.log("\n📈 Creating stress transaction entries...");

	// 500 entries on the pagination account
	for (let i = 0; i < 500; i++) {
		const transactionDate = daysAgo(500 - i);
		await db.insert(schema.accountTransactions).values({
			slug: slug(),
			accountId: stressPaginationAccountId,
			type: "value_change",
			amount: 100000 + i * 200,
			category: null,
			description: i % 50 === 0 ? "x".repeat(1000) : null,
			transactionDate,
			createdAt: transactionDate,
		});
	}

	// Extreme value transactions on first 6 normal accounts
	const extremeTransactions = [
		{
			amount: 99_999_999_900,
			description: "£999,999,999 - 9-digit shorthand",
		},
		{ amount: 100_000_000_000, description: "£1,000,000,000 - 1B boundary" },
		{
			amount: -50_000_000_000,
			description: "£-500,000,000 - negative 9-digit",
		},
		{ amount: 1, description: "£0.01 - 1-penny precision" },
		{ amount: -1, description: "£-0.01 - negative 1-penny" },
		{ amount: 0, description: "£0 - exact zero" },
	];
	for (let i = 0; i < extremeTransactions.length; i++) {
		const accountId = createdAccountIds[i + 5] ?? createdAccountIds[i]; // skip pagination account
		const transactionDate = daysAgo(0);
		await db.insert(schema.accountTransactions).values({
			slug: slug(),
			accountId,
			type: "value_change",
			amount: extremeTransactions[i].amount,
			category: null,
			description: extremeTransactions[i].description,
			transactionDate,
			createdAt: transactionDate,
		});
	}

	// MAX_SAFE_INTEGER / JS edge value transactions
	const edgeAccountId = createdAccountIds[12] ?? createdAccountIds[0];
	for (const val of [MAX_SAFE, -MAX_SAFE, 2_147_483_647]) {
		const transactionDate = daysAgo(randomBetween(1, 30));
		await db.insert(schema.accountTransactions).values({
			slug: slug(),
			accountId: edgeAccountId,
			type: "value_change",
			amount: val,
			category: null,
			description: `Edge value: ${val}`,
			transactionDate,
			createdAt: transactionDate,
		});
	}

	// 10 null-notes entries
	for (let i = 0; i < 10; i++) {
		const transactionDate = daysAgo(randomBetween(10, 200));
		await db.insert(schema.accountTransactions).values({
			slug: slug(),
			accountId: createdAccountIds[i % createdAccountIds.length],
			type: "value_change",
			amount: randomBetween(10000, 500000),
			category: null,
			description: null,
			transactionDate,
			createdAt: transactionDate,
		});
	}

	console.log(
		`  ✓ 500-entry pagination account, extreme values, edge integers`,
	);

	// ─── Goals ───────────────────────────────────────────────────────────────

	console.log("\n🎯 Creating 70 stress goals (50 active + 20 archived)...");

	let _richGoalId = 0; // goal that gets 200 allocations

	// 50 active goals
	for (let i = 0; i < 50; i++) {
		const now = new Date();
		const isSpecial = i === 0;
		const [goal] = await db
			.insert(schema.goals)
			.values({
				slug: slug(),
				userId,
				name:
					i === 1
						? "A"
						: i === 2
							? "A".repeat(300)
							: i === 3
								? "Multiple Emergency Fund"
								: `Stress Goal ${String(i + 1).padStart(2, "0")}`,
				targetAmountInCents:
					i === 4
						? 0
						: i === 5
							? 1
							: i === 6
								? MAX_SAFE
								: randomBetween(50000, 5000000),
				currentAllocation: 0,
				targetDate:
					i % 3 === 0 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
				isEmergencyFund: i === 3,
				sortOrder: i,
				deletedAt: null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		if (isSpecial) _richGoalId = goal.id;

		// Give first goal 200 allocations (all 3 types + null accountId)
		if (isSpecial) {
			const types = ["USER_ADD", "USER_WITHDRAW", "GOAL_DELETED"] as const;
			let runningTotal = 0;
			for (let j = 0; j < 200; j++) {
				const type = types[j % 3];
				const isNegative = type === "USER_WITHDRAW" || type === "GOAL_DELETED";
				const amount = isNegative ? -1000 : j % 10 === 0 ? 500000 : 5000;
				const accountId =
					j % 10 === 0
						? null
						: (createdAccountIds[j % createdAccountIds.length] ?? null);
				const allocDate = daysAgo(200 - j);
				await db.insert(schema.goalAllocations).values({
					goalId: goal.id,
					accountId,
					amount,
					type,
					allocationDate: allocDate,
					createdAt: allocDate,
				});
				runningTotal += amount;
			}
			await db
				.update(schema.goals)
				.set({ currentAllocation: runningTotal })
				.where(eq(schema.goals.id, goal.id));
		} else if (i === 6) {
			// Goal with MAX_SAFE allocation (wildly overfunded)
			const alloc = MAX_SAFE;
			const now2 = new Date();
			await db.insert(schema.goalAllocations).values({
				goalId: goal.id,
				accountId: createdAccountIds[0] ?? null,
				amount: alloc,
				type: "USER_ADD",
				allocationDate: now2,
				createdAt: now2,
			});
			await db
				.update(schema.goals)
				.set({ currentAllocation: alloc })
				.where(eq(schema.goals.id, goal.id));
		} else if (i > 7) {
			const amount = randomBetween(1000, 200000);
			const now2 = new Date();
			await db.insert(schema.goalAllocations).values({
				goalId: goal.id,
				accountId: createdAccountIds[i % createdAccountIds.length] ?? null,
				amount,
				type: "USER_ADD",
				allocationDate: now2,
				createdAt: now2,
			});
			await db
				.update(schema.goals)
				.set({ currentAllocation: amount })
				.where(eq(schema.goals.id, goal.id));
		}
	}

	// 20 archived goals
	for (let i = 0; i < 20; i++) {
		const archivedDate = daysAgo(randomBetween(30, 700));
		const now = new Date();
		await db.insert(schema.goals).values({
			slug: slug(),
			userId,
			name: `Archived Goal ${String(i + 1).padStart(2, "0")}`,
			targetAmountInCents: randomBetween(50000, 500000),
			currentAllocation: 0,
			targetDate: null,
			isEmergencyFund: false,
			sortOrder: 50 + i,
			deletedAt: archivedDate,
			createdAt: now,
			updatedAt: now,
		});
	}

	console.log(
		`  ✓ 50 active goals (goal #1 has 200 allocations) + 20 archived`,
	);

	// ─── Snapshots ───────────────────────────────────────────────────────────

	console.log(
		"\n📸 Creating ~204 monthly snapshots (2009-03-01 → 2026-02-01)...",
	);

	let snapshotCount = 0;
	const startYear = 2009,
		startMonth = 3;
	const endYear = 2026,
		endMonth = 2;

	for (let y = startYear; y <= endYear; y++) {
		const mStart = y === startYear ? startMonth : 1;
		const mEnd = y === endYear ? endMonth : 12;
		for (let m = mStart; m <= mEnd; m++) {
			const date = `${y}-${String(m).padStart(2, "0")}-01`;
			const monthIdx = (y - startYear) * 12 + (m - startMonth);
			const total = monthIdx;

			// Trending net worth with some oscillation
			const base = 5_000_000 + monthIdx * 50_000;
			const wave = Math.round(Math.sin(monthIdx / 6) * 200_000);
			let netWorth = base + wave;

			// Special snapshots
			let notes: string | null = null;
			if (monthIdx === 0) notes = null; // oldest: no trends
			if (monthIdx === 100) notes = "x".repeat(5000); // 5000-char notes
			if (monthIdx === 80) netWorth = -500_000; // negative net worth dip
			if (monthIdx === total - 1) netWorth = MAX_SAFE; // extreme positive (second-last)

			const assets = Math.max(0, netWorth + 500_000);
			const liabilities = assets - netWorth;

			// Generate extreme interest values for stress testing
			// Progressive accumulation across 204 snapshots
			const interestMultiplier = Math.min(1, monthIdx / 100);
			const actualTaxFree = Math.round(monthIdx * 5000 * interestMultiplier);
			const actualTaxable = Math.round(monthIdx * 25000 * interestMultiplier);
			const projectedTaxFree = Math.round(100000 * interestMultiplier);
			const projectedTaxable = Math.round(500000 * interestMultiplier);
			const isaUsed = Math.min(20_000_00, monthIdx * 200000);

			await db.insert(schema.snapshots).values({
				slug: slug(),
				userId,
				snapshotDate: date,
				netWorthInCents: netWorth,
				totalAssetsInCents: assets,
				totalLiabilitiesInCents: -liabilities,
				totalAllocatedInCents: randomBetween(0, 200_000),
				accountsBreakdown: {
					snapshotTakenAt: new Date().toISOString(),
					accounts: [],
					totalByType: {},
				},
				goalsBreakdown: {
					goals: [],
					totalAllocated: 0,
				},
				isaBreakdown: {
					snapshotTakenAt: new Date().toISOString(),
					snapshotDate: date,
					taxYear: {
						start: `${y}-04-06`,
						end: `${y + 1}-04-05`,
						label: `${y}-${String(y + 1).slice(-2)}`,
					},
					allowance: {
						usedThisTaxYear: isaUsed,
						limit: 20_000_00,
						remaining: Math.max(0, 20_000_00 - isaUsed),
						usedThisSnapshotDate: isaUsed,
					},
				},
				interestBreakdownDetail: {
					snapshotTakenAt: new Date().toISOString(),
					snapshotDate: date,
					taxYear: {
						start: `${y}-04-06`,
						end: `${y + 1}-04-05`,
						label: `${y}-${String(y + 1).slice(-2)}`,
					},
					actualInterest: {
						taxFree: actualTaxFree,
						taxable: actualTaxable,
						total: actualTaxFree + actualTaxable,
					},
					projectedInterest: {
						taxFree: projectedTaxFree,
						taxable: projectedTaxable,
						total: projectedTaxFree + projectedTaxable,
					},
					totalExpected: {
						taxFree: actualTaxFree + projectedTaxFree,
						taxable: actualTaxable + projectedTaxable,
						total:
							actualTaxFree +
							actualTaxable +
							projectedTaxFree +
							projectedTaxable,
					},
					taxPosition: {
						taxBand: "basic",
						personalSavingsAllowance: {
							allowance: 1_000_00,
							used: actualTaxable,
							remaining: Math.max(0, 1_000_00 - actualTaxable),
							overAllowance: actualTaxable > 1_000_00,
							taxableAmount: Math.max(0, actualTaxable - 1_000_00),
						},
					},
					byAccount: [],
				},
				notes,
			});

			snapshotCount++;
		}
	}

	console.log(`  ✓ ${snapshotCount} snapshots created`);
	console.log("\n✅ [stress] Seed complete!");
	console.log(
		`   50 accounts | 70 goals (50+20 archived) | ${snapshotCount} snapshots | ${totalNotes} notes`,
	);
	console.log(
		`   ~${500 + 6 + 3 + 10} special transaction entries + pagination account`,
	);
}
