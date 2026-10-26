import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	budgetConfigAmendments,
	budgetMonths,
	spendingCategories,
	users,
} from "$lib/db/schema";
import {
	amendBudgetConfig,
	getAmendmentTimeline,
	getBudgetHistory,
	getBudgetRow,
	getBudgetStatus,
	getCategoryBreakdown,
	getMonthAmendments,
	type ParsedBudgetRow,
	saveBudgetRow,
} from "./budgets";

let testUserId: number;
let accountAId: number; // scoped-in account
let accountCId: number; // account that must be invisible when excluded
let categoryId: number;
const cleanupAccountIds: number[] = [];
let cleanupCategoryId: number | null = null;
const cleanupMonthKeys: string[] = [];

/**
 * Fixed months (2024 — distinct from budgets.test.ts's 2026 so parallel
 * test files never collide on month keys) so roll-forward and
 * days-elapsed logic can't interfere.
 */
const PAST_KEY = "2023-12";
const MONTH_KEY = "2024-01";
const FUTURE_KEYS = ["2024-02", "2024-03"];

function jan(day: number): Date {
	return new Date(2024, 0, day, 12, 0, 0);
}

async function insertTx(
	accountId: number,
	values: {
		type: string;
		amount: number;
		categoryId?: number | null;
		day: number;
		description?: string;
	},
) {
	await db.insert(accountTransactions).values({
		slug: nanoid(21),
		accountId,
		type: values.type as never,
		amount: values.amount,
		categoryId: values.categoryId ?? null,
		description: values.description ?? null,
		transactionDate: jan(values.day),
	});
}

async function insertBudgetRow(month: string, total = 10000) {
	const [row] = await db
		.insert(budgetMonths)
		.values({
			userId: testUserId,
			month,
			totalTargetInCents: total,
			excludedCategoryIds: [],
			excludedAccountIds: [],
			excludedTypes: [],
			categoryTargets: {},
		})
		.returning();
	return row;
}

/** BudgetConfig view of a parsed row — reuse for read helpers. */
function asConfig(row: ParsedBudgetRow) {
	return {
		totalTargetInCents: row.totalTargetInCents,
		excludedCategoryIds: row.excludedCategoryIds,
		excludedAccountIds: row.excludedAccountIds,
		excludedTypes: row.excludedTypes,
		categoryTargets: row.categoryTargets,
	};
}

/** Snapshot of every transaction fact — config edits must never touch these. */
async function transactionFingerprint(): Promise<string> {
	const rows = await db
		.select({
			id: accountTransactions.id,
			accountId: accountTransactions.accountId,
			type: accountTransactions.type,
			amount: accountTransactions.amount,
			createdAt: accountTransactions.createdAt,
		})
		.from(accountTransactions)
		.where(inArray(accountTransactions.accountId, cleanupAccountIds));
	return JSON.stringify(rows);
}

beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({
			username: `budgets-amend-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	testUserId = user.id;

	const [accountA] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Amend Test Current A",
			type: "current",
			taxWrapper: "none",
			category: "asset",
		})
		.returning();
	accountAId = accountA.id;
	cleanupAccountIds.push(accountAId);

	const [accountC] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Amend Test Current C",
			type: "current",
			taxWrapper: "none",
			category: "asset",
		})
		.returning();
	accountCId = accountC.id;
	cleanupAccountIds.push(accountCId);

	const [category] = await db
		.insert(spendingCategories)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Amend Test Food",
			key: `amend-test-${nanoid(6)}`,
			colour: "#000000",
		})
		.returning({ id: spendingCategories.id });
	categoryId = category.id;
	cleanupCategoryId = category.id;

	// Month rows: one past, the target month, two future (for forward-apply)
	await insertBudgetRow(PAST_KEY, 8000);
	await insertBudgetRow(MONTH_KEY, 10000);
	for (const key of FUTURE_KEYS) await insertBudgetRow(key, 10000);
	cleanupMonthKeys.push(PAST_KEY, MONTH_KEY, ...FUTURE_KEYS);

	// January transactions:
	// A: £50 withdrawal − £20 refund (category) = £30 net
	await insertTx(accountAId, {
		type: "withdrawal",
		amount: -5000,
		categoryId: category.id,
		day: 5,
		description: "Food shop",
	});
	await insertTx(accountAId, {
		type: "refund",
		amount: 2000,
		categoryId: category.id,
		day: 8,
		description: "Food refund",
	});
	// C: £30 withdrawal (uncategorised) — must vanish when C is excluded
	await insertTx(accountCId, {
		type: "withdrawal",
		amount: -3000,
		day: 10,
		description: "On account C",
	});
});

afterAll(async () => {
	// Amendments reference budget months — delete the trail first (FK on).
	// Month keys are this file's alone, but filter by user regardless.
	const monthRows = await db
		.select({ id: budgetMonths.id })
		.from(budgetMonths)
		.where(
			and(
				eq(budgetMonths.userId, testUserId),
				inArray(budgetMonths.month, cleanupMonthKeys),
			),
		);
	const monthIds = monthRows.map((r) => r.id);
	if (monthIds.length) {
		await db
			.delete(budgetConfigAmendments)
			.where(inArray(budgetConfigAmendments.budgetMonthId, monthIds));
		await db.delete(budgetMonths).where(inArray(budgetMonths.id, monthIds));
	}
	for (const accountId of cleanupAccountIds) {
		await db
			.delete(accountTransactions)
			.where(eq(accountTransactions.accountId, accountId));
	}
	if (cleanupCategoryId !== null) {
		await db
			.delete(spendingCategories)
			.where(eq(spendingCategories.id, cleanupCategoryId));
	}
	for (const accountId of cleanupAccountIds) {
		await db.delete(accounts).where(eq(accounts.id, accountId));
	}
	await db.delete(users).where(eq(users.id, testUserId));
});

describe("type exclusion across totals/breakdown/targets (task 5.1)", () => {
	it("baseline nets refunds: £50 − £20 + £30 (C) = £60", async () => {
		const status = await getBudgetStatus(testUserId, 2024, 1);
		expect(status.totalSpent).toBe(6000);
	});

	it("excluding refund removes its netting in totals, breakdown and history", async () => {
		const result = await amendBudgetConfig(testUserId, MONTH_KEY, (row) => ({
			excludedTypes: [...row.excludedTypes, "refund"],
		}));
		expect(result.ok).toBe(true);

		// £50 + £30 = £80 everywhere (refund no longer nets)
		const status = await getBudgetStatus(testUserId, 2024, 1);
		expect(status.totalSpent).toBe(8000);

		const budget = await getBudgetRow(testUserId, MONTH_KEY);
		if (!budget) throw new Error("budget row missing");
		const breakdown = await getCategoryBreakdown(
			testUserId,
			2024,
			1,
			asConfig(budget),
		);
		const food = breakdown.find((c) => c.id === categoryId);
		expect(food?.spent).toBe(5000); // target progress reads the same number

		const history = await getBudgetHistory(testUserId, 0, 24);
		const jan = history.months.find((m) => m.month === MONTH_KEY);
		expect(jan?.actualSpent).toBe(8000);
	});

	it("invalid excluded types are rejected on write (validated against TRANSACTION_TYPES)", async () => {
		await saveBudgetRow(testUserId, FUTURE_KEYS[0], {
			// Deliberately bogus value at the boundary — must be sanitized out
			excludedTypes: ["refund", "not-a-real-type"],
		});
		const row = await getBudgetRow(testUserId, FUTURE_KEYS[0]);
		expect(row?.excludedTypes).toEqual(["refund"]);
	});
});

describe("budget scoping (task 5.1)", () => {
	it("transactions on excluded account C are invisible", async () => {
		const result = await amendBudgetConfig(testUserId, MONTH_KEY, (row) => ({
			excludedAccountIds: [...row.excludedAccountIds, accountCId],
		}));
		expect(result.ok).toBe(true);

		const status = await getBudgetStatus(testUserId, 2024, 1);
		// £50 (A only; C's £30 gone; refund still excluded)
		expect(status.totalSpent).toBe(5000);

		const budget = await getBudgetRow(testUserId, MONTH_KEY);
		if (!budget) throw new Error("budget row missing");
		const breakdown = await getCategoryBreakdown(
			testUserId,
			2024,
			1,
			asConfig(budget),
		);
		const uncategorised = breakdown.find((c) => c.name === "Uncategorised");
		expect(uncategorised?.spent).toBe(0);
	});
});

describe("amendment trail (task 5.2)", () => {
	it("retroactive edit trails old → new with timestamp; note optional", async () => {
		await amendBudgetConfig(
			testUserId,
			MONTH_KEY,
			(row) => ({
				categoryTargets: {
					...row.categoryTargets,
					[String(categoryId)]: 35000,
				},
				totalTargetInCents: 35000,
			}),
			{ note: "corrected after statement" },
		);

		const amendments = await getMonthAmendments(testUserId, MONTH_KEY);
		const targetAmendment = amendments.find(
			(a) => a.field === `categoryTarget:${categoryId}`,
		);
		expect(targetAmendment).toBeDefined();
		expect(targetAmendment?.oldValue).toBeNull();
		expect(targetAmendment?.newValue).toBe(35000);
		expect(targetAmendment?.note).toBe("corrected after statement");
		expect(Number.isNaN(Date.parse(targetAmendment?.createdAt ?? ""))).toBe(
			false,
		);

		// A no-note edit records null, never a forced reason
		await amendBudgetConfig(testUserId, MONTH_KEY, (row) => ({
			categoryTargets: { ...row.categoryTargets, [String(categoryId)]: 40000 },
			totalTargetInCents: 40000,
		}));
		const after = await getMonthAmendments(testUserId, MONTH_KEY);
		const second = after.find(
			(a) => a.field === `categoryTarget:${categoryId}` && a.newValue === 40000,
		);
		expect(second?.oldValue).toBe(35000);
		expect(second?.note).toBeNull();
	});

	it("unchanged fields are not trailed", async () => {
		const before = (await getMonthAmendments(testUserId, MONTH_KEY)).length;
		await amendBudgetConfig(testUserId, MONTH_KEY, (row) => ({
			excludedAccountIds: [...row.excludedAccountIds], // identical content
		}));
		const after = (await getMonthAmendments(testUserId, MONTH_KEY)).length;
		expect(after).toBe(before);
	});

	it("forward-apply writes N trailed rows and zero past rows", async () => {
		const result = await amendBudgetConfig(
			testUserId,
			MONTH_KEY,
			() => ({ totalTargetInCents: 12000 }),
			{ applyForward: true, note: "inflation adjust" },
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.monthsChanged).toBe(3); // Jan + Feb + Mar

		const past = await getMonthAmendments(testUserId, PAST_KEY);
		expect(past.length).toBe(0);
		expect((await getBudgetRow(testUserId, PAST_KEY))?.totalTargetInCents).toBe(
			8000,
		); // untouched

		for (const key of [MONTH_KEY, ...FUTURE_KEYS]) {
			const row = await getBudgetRow(testUserId, key);
			expect(row?.totalTargetInCents).toBe(12000);
			const amendments = await getMonthAmendments(testUserId, key);
			expect(
				amendments.some(
					(a) =>
						a.field === "totalTargetInCents" &&
						a.newValue === 12000 &&
						a.note === "inflation adjust",
				),
			).toBe(true);
		}
	});

	it("transactions are untouched by any config edit", async () => {
		const before = await transactionFingerprint();

		await amendBudgetConfig(testUserId, MONTH_KEY, (row) => ({
			excludedTypes: row.excludedTypes.includes("refund")
				? row.excludedTypes
				: [...row.excludedTypes, "refund"],
			excludedCategoryIds: [categoryId],
			totalTargetInCents: 9900,
		}));
		await amendBudgetConfig(
			testUserId,
			MONTH_KEY,
			(row) => ({
				excludedAccountIds: [...row.excludedAccountIds, accountCId],
			}),
			{ applyForward: true },
		);

		const after = await transactionFingerprint();
		expect(after).toBe(before);
	});

	it("creating a budget row trails initial values with null old", async () => {
		await saveBudgetRow(testUserId, "2024-05", {
			totalTargetInCents: 20000,
		});
		cleanupMonthKeys.push("2024-05");

		const amendments = await getMonthAmendments(testUserId, "2024-05");
		expect(amendments.length).toBe(1);
		expect(amendments[0]?.field).toBe("totalTargetInCents");
		expect(amendments[0]?.oldValue).toBeNull();
		expect(amendments[0]?.newValue).toBe(20000);
	});

	it("year timeline lists amendments across months, latest first", async () => {
		const timeline = await getAmendmentTimeline(testUserId);
		expect(timeline.length).toBeGreaterThan(0);
		// All entries carry their month and are ordered newest first
		for (let i = 1; i < timeline.length; i++) {
			expect(timeline[i - 1].createdAt >= timeline[i].createdAt).toBe(true);
		}
		expect(timeline.every((a) => /^\d{4}-\d{2}$/.test(a.month))).toBe(true);
	});
});
