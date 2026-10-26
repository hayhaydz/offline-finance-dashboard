import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	budgetConfigAmendments,
	budgetMonths,
	users,
} from "$lib/db/schema";
import { saveBudgetRow } from "$lib/server/budgets";
import {
	generateDataKey,
	sealKeyring,
	unlockKeyring,
} from "$lib/server/crypto/keyring";
import { decryptTxDescription } from "$lib/server/crypto/protected-fields";

/**
 * data-layer-integrity tasks 4.1/4.2:
 * - account + opening balance commit in ONE transaction (a failing opening
 *   balance write leaves no account row)
 * - budget config write + amendment trail commit in ONE transaction (a
 *   failing amendment leaves the config unchanged)
 *
 * Failure injection follows the migrate-register-atomicity pattern: the
 * value-layer encrypt helper is delegating-mocked so a single opening-
 * balance write can be made to fail while everything else stays real.
 */

type ProtectedFields = typeof import("$lib/server/crypto/protected-fields");
const actualProtectedFields = vi.hoisted(() => ({
	ref: {} as ProtectedFields,
}));
const encryptTxMock = vi.hoisted(() => vi.fn());
vi.mock("$lib/server/crypto/protected-fields", async (importOriginal) => {
	const actual = await importOriginal<ProtectedFields>();
	actualProtectedFields.ref = actual;
	encryptTxMock.mockImplementation(
		(userId: number, slug: string, description: string | null) =>
			actual.encryptTxDescription(userId, slug, description),
	);
	return { ...actual, encryptTxDescription: encryptTxMock };
});

const createActions = (
	await import("../../src/routes/accounts/create/+page.server")
).actions;

let testUserId: number;
const cleanupAccountIds: number[] = [];
const cleanupBudgetMonthIds: number[] = [];
const cleanupUserIds: number[] = [];

function createForm(initialBalance: string, name: string) {
	const formData = new FormData();
	formData.append("name", name);
	formData.append("type", "current");
	formData.append("taxWrapper", "none");
	formData.append("institution", "Atomicity Bank");
	formData.append("liquidity", "instant");
	formData.append("initialBalance", initialBalance);
	return new Request("http://localhost/accounts/create", {
		method: "POST",
		body: formData,
	});
}

beforeEach(async () => {
	encryptTxMock.mockClear();
	encryptTxMock.mockImplementation(
		(userId: number, slug: string, description: string | null) =>
			actualProtectedFields.ref.encryptTxDescription(userId, slug, description),
	);
	const [user] = await db
		.insert(users)
		.values({
			username: `atomicity-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	testUserId = user.id;
	cleanupUserIds.push(testUserId);
	unlockKeyring(testUserId, generateDataKey());
});

afterEach(async () => {
	sealKeyring("atomicity-teardown");
	if (cleanupAccountIds.length > 0) {
		await db
			.delete(accountTransactions)
			.where(inArray(accountTransactions.accountId, cleanupAccountIds));
		await db.delete(accounts).where(inArray(accounts.id, cleanupAccountIds));
		cleanupAccountIds.length = 0;
	}
	if (cleanupBudgetMonthIds.length > 0) {
		await db
			.delete(budgetConfigAmendments)
			.where(
				inArray(budgetConfigAmendments.budgetMonthId, cleanupBudgetMonthIds),
			);
		await db
			.delete(budgetMonths)
			.where(inArray(budgetMonths.id, cleanupBudgetMonthIds));
		cleanupBudgetMonthIds.length = 0;
	}
	await db.delete(users).where(inArray(users.id, cleanupUserIds));
	cleanupUserIds.length = 0;
});

describe("account creation atomicity (task 4.1)", () => {
	it("happy path: account + opening balance commit together", async () => {
		let threw: unknown = null;
		try {
			await createActions.default({
				request: createForm("150.00", `Happy ${nanoid(4)}`),
				locals: {
					user: { id: testUserId, username: "atomicity" },
				},
			} as never);
			expect.fail("expected redirect");
		} catch (e) {
			threw = e;
		}
		expect((threw as { status?: number })?.status).toBe(303);

		const [account] = await db
			.select()
			.from(accounts)
			.where(eq(accounts.userId, testUserId));
		expect(account).toBeDefined();
		cleanupAccountIds.push(account.id);

		const txs = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, account.id));
		expect(txs).toHaveLength(1);
		expect(txs[0].type).toBe("deposit");
		expect(txs[0].amount).toBe(15000);
		expect(
			decryptTxDescription(testUserId, txs[0].slug, txs[0].description),
		).toBe("Opening balance");
	});

	it("opening-balance failure rolls the account back completely", async () => {
		// The next encryptTxDescription call (the opening-balance write)
		// fails INSIDE the transaction — nothing may persist.
		encryptTxMock.mockImplementationOnce(() => {
			throw new Error("simulated opening-balance encryption failure");
		});

		const result = await createActions.default({
			request: createForm("99.00", `Doomed ${nanoid(4)}`),
			locals: {
				user: { id: testUserId, username: "atomicity" },
			},
		} as never);

		expect((result as { status?: number }).status).toBe(500);

		const accountRows = await db
			.select()
			.from(accounts)
			.where(eq(accounts.userId, testUserId));
		expect(accountRows).toHaveLength(0);

		const txRows = await db
			.select({ id: accountTransactions.id })
			.from(accountTransactions)
			.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
			.where(eq(accounts.userId, testUserId));
		expect(txRows).toHaveLength(0);
	});
});

describe("budget writeWithTrail atomicity (task 4.2)", () => {
	const MONTH = "2027-01";

	it("happy path: config + amendment trail commit together", async () => {
		await saveBudgetRow(testUserId, MONTH, {
			totalTargetInCents: 200000,
		});

		const [row] = await db
			.select()
			.from(budgetMonths)
			.where(eq(budgetMonths.userId, testUserId));
		expect(row).toBeDefined();
		expect(row.month).toBe(MONTH);
		expect(row.totalTargetInCents).toBe(200000);
		cleanupBudgetMonthIds.push(row.id);

		const amendments = await db
			.select()
			.from(budgetConfigAmendments)
			.where(eq(budgetConfigAmendments.budgetMonthId, row.id));
		expect(amendments).toHaveLength(1);
		expect(amendments[0].field).toBe("totalTargetInCents");
	});

	it("amendment failure rolls the config update back", async () => {
		// Established baseline config
		await saveBudgetRow(testUserId, MONTH, { totalTargetInCents: 100000 });
		const [row] = await db
			.select()
			.from(budgetMonths)
			.where(eq(budgetMonths.userId, testUserId));
		cleanupBudgetMonthIds.push(row.id);
		const amendmentsBefore = await db
			.select({ id: budgetConfigAmendments.id })
			.from(budgetConfigAmendments)
			.where(eq(budgetConfigAmendments.budgetMonthId, row.id));

		// Circular JSON makes the value stringify throw INSIDE the
		// transaction — the whole write must roll back.
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		await expect(
			saveBudgetRow(testUserId, MONTH, {
				categoryTargets: circular as never,
			}),
		).rejects.toThrow();

		const [after] = await db
			.select()
			.from(budgetMonths)
			.where(eq(budgetMonths.id, row.id));
		expect(after.totalTargetInCents).toBe(100000);

		const amendmentsAfter = await db
			.select({ id: budgetConfigAmendments.id })
			.from(budgetConfigAmendments)
			.where(eq(budgetConfigAmendments.budgetMonthId, row.id));
		expect(amendmentsAfter).toHaveLength(amendmentsBefore.length);
	});

	it("create-path failure leaves no budget month row", async () => {
		const FRESH_MONTH = "2027-02";
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		await expect(
			saveBudgetRow(testUserId, FRESH_MONTH, {
				categoryTargets: circular as never,
			}),
		).rejects.toThrow();

		const rows = await db
			.select()
			.from(budgetMonths)
			.where(eq(budgetMonths.userId, testUserId));
		expect(rows.filter((r) => r.month === FRESH_MONTH)).toHaveLength(0);
	});
});
