import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	expensesHistory,
	importJobs,
	users,
} from "$lib/db/schema";
import { generateDataKey, unlockKeyring } from "$lib/server/crypto/keyring";
import { commitHistoryImport, HISTORY_CSV_HEADER } from "./history-csv";
import {
	enqueueImportJob,
	listImportJobs,
	QUEUE_THRESHOLD_BYTES,
	runImportWorker,
} from "./import-jobs";

/**
 * v3 B06 slice S4 (R22): background import queue. Enqueue seals the
 * payload under the owner's DataKey; the worker claims atomically,
 * executes the same engines as inline commits and records counts.
 */

let testUserId: number;
let otherUserId: number;
let accountSlug: string;
let accountId: number;
const cleanupUserIds: number[] = [];

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `jobs-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	return user.id;
}

function txCsv(rows: string[]): string {
	return [
		"account_slug,id,date,type,amount,description,category,_delete",
		...rows,
	].join("\n");
}

beforeAll(async () => {
	testUserId = await insertUser();
	unlockKeyring(testUserId, generateDataKey());
	otherUserId = await insertUser();
	cleanupUserIds.push(testUserId, otherUserId);
	const [account] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Queue Test",
			type: "current",
			taxWrapper: "none",
			category: "asset",
			closedAt: null,
			excludedFromNetWorth: false,
		})
		.returning({ id: accounts.id, slug: accounts.slug });
	accountId = account.id;
	accountSlug = account.slug;
});

afterAll(async () => {
	await db
		.delete(accountTransactions)
		.where(eq(accountTransactions.accountId, accountId));
	await db.delete(accounts).where(eq(accounts.id, accountId));
	await db.delete(expensesHistory).where(eq(expensesHistory.userId, testUserId));
	await db.delete(importJobs).where(eq(importJobs.userId, testUserId));
	for (const id of cleanupUserIds) {
		await db.delete(users).where(eq(users.id, id));
	}
});

describe("import queue (R22)", () => {
	it("enqueues, executes a transactions job and reports counts", async () => {
		const csv = txCsv([
			[accountSlug, "", "2026-07-01", "deposit", "10.00", "queued insert", "", ""].join(
				",",
			),
		]);
		const job = await enqueueImportJob(testUserId, "transactions", csv, {
			recovery: false,
		});
		expect(job.status).toBe("queued");
		expect(job.slug).toHaveLength(21);

		await runImportWorker();

		const jobs = await listImportJobs(testUserId);
		const done = jobs.find((j) => j.slug === job.slug);
		expect(done?.status).toBe("done");
		expect(done?.resultCounts).toEqual({
			inserted: 1,
			edited: 0,
			deleted: 0,
			skipped: 0,
		});
		expect(done?.rowsTotal).toBe(1);

		// The engine actually applied the payload
		const rows = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountId));
		expect(rows.length).toBe(1);
		expect(rows[0]?.amount).toBe(1000);
	});

	it("stores the payload sealed (v1| ciphertext, not plaintext CSV)", async () => {
		const csv = txCsv([
			[accountSlug, "", "2026-07-02", "deposit", "5.00", "secret job text", "", ""].join(
				",",
			),
		]);
		const job = await enqueueImportJob(testUserId, "transactions", csv, {
			recovery: false,
		});
		const [row] = await db
			.select({ payload: importJobs.payload })
			.from(importJobs)
			.where(eq(importJobs.slug, job.slug));
		expect(row?.payload.startsWith("v1|")).toBe(true);
		expect(row?.payload).not.toContain("secret job text");
		await runImportWorker();
	});

	it("executes a history job and records the first refusal error on bad files", async () => {
		const good = [
			"# kind: expenses",
			HISTORY_CSV_HEADER,
			"2026-09,120.00,from queue,",
		].join("\n");
		const job = await enqueueImportJob(
			testUserId,
			"history_expenses",
			good,
			{ recovery: false },
		);
		await runImportWorker();
		const done = (await listImportJobs(testUserId)).find(
			(j) => j.slug === job.slug,
		);
		expect(done?.status).toBe("done");
		expect(done?.resultCounts?.inserted).toBe(1);

		const bad = [HISTORY_CSV_HEADER, "2026-99,1.00,,"].join("\n");
		const failing = await enqueueImportJob(
			testUserId,
			"history_expenses",
			bad,
			{ recovery: false },
		);
		await runImportWorker();
		const failed = (await listImportJobs(testUserId)).find(
			(j) => j.slug === failing.slug,
		);
		expect(failed?.status).toBe("failed");
		expect(failed?.errorMessage).toContain("month");
	});

	it("lists only the owner's jobs", async () => {
		const csv = txCsv([
			[accountSlug, "", "2026-07-03", "deposit", "1.00", "mine only", "", ""].join(","),
		]);
		await enqueueImportJob(testUserId, "transactions", csv, { recovery: false });
		await runImportWorker();
		const mine = await listImportJobs(testUserId);
		const theirs = await listImportJobs(otherUserId);
		expect(mine.length).toBeGreaterThan(0);
		expect(theirs).toEqual([]);
	});

	it("queue thresholds are set so inline stays the default for small files", () => {
		expect(QUEUE_THRESHOLD_BYTES.transactions).toBeGreaterThan(100_000);
		expect(QUEUE_THRESHOLD_BYTES.history).toBeGreaterThan(10_000);
	});

	it("history engine parity: the same csv inline and queued behaves identically", async () => {
		const csv = [
			"# kind: expenses",
			HISTORY_CSV_HEADER,
			"2026-10,50.00,parity,",
		].join("\n");
		const inline = await commitHistoryImport(testUserId, "expenses", csv);
		await runImportWorker(); // drain anything pending
		const queued = await enqueueImportJob(
			testUserId,
			"history_expenses",
			csv.replace("50.00", "60.00"),
			{ recovery: false },
		);
		await runImportWorker();
		expect(inline.ok).toBe(true);
		const done = (await listImportJobs(testUserId)).find(
			(j) => j.slug === queued.slug,
		);
		expect(done?.status).toBe("done");
		expect(done?.resultCounts?.edited).toBe(1);
	});
});
