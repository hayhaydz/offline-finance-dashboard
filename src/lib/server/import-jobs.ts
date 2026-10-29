import { and, desc, eq, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { importJobs } from "$lib/db/schema";
import { requireDataKey } from "$lib/server/crypto/keyring";
import {
	decryptValue,
	encryptValue,
	type ValueAAD,
} from "$lib/server/crypto/value-codec";
import { commitHistoryImport } from "$lib/server/history-csv";
import { commitReimport } from "$lib/server/imports-update";
import { devLog, logError } from "$lib/server/logger";

/**
 * Background import queue (v3 B06 slice S4, R22).
 *
 * Big CSV imports no longer block a form post: the upload is accepted
 * immediately (payload sealed under the owner's DataKey), the dev-server
 * process claims and executes queued jobs, and the UI polls job status.
 * Small imports stay inline — the queue is progressive enhancement, not
 * a migration of what already works.
 *
 * Execution model: a module-level worker flag + claim loop. Jobs are
 * claimed atomically (UPDATE … WHERE status='queued' RETURNING), so two
 * workers cannot take the same job. Orphaned 'running' rows (server died
 * mid-job) are swept to 'failed' after 10 minutes on the next enqueue or
 * poll — no boot hook needed.
 */

export type ImportJobKind =
	| "transactions"
	| "history_expenses"
	| "history_income";

export const IMPORT_JOB_KINDS: readonly ImportJobKind[] = [
	"transactions",
	"history_expenses",
	"history_income",
];

/** Commit payloads larger than this go through the queue instead of inline. */
export const QUEUE_THRESHOLD_BYTES = {
	transactions: 1_000_000, // 1MB
	history: 200_000, // 200KB
} as const;

/** Rows above this count are always queued, whatever the byte size. */
export const QUEUE_THRESHOLD_ROWS = 2_000;

// ---------------------------------------------------------------------------
// Payload sealing (value layer — no plaintext CSV at rest)
// ---------------------------------------------------------------------------

function jobAAD(userId: number, slug: string): ValueAAD {
	return { table: "import_job", rowId: slug, column: `user-${userId}` };
}

// ---------------------------------------------------------------------------
// Enqueue + list
// ---------------------------------------------------------------------------

export interface ImportJobView {
	slug: string;
	kind: string;
	status: string;
	rowsTotal: number;
	errorMessage: string | null;
	resultCounts: {
		inserted: number;
		edited: number;
		deleted: number;
		skipped: number;
	} | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
}

export async function enqueueImportJob(
	userId: number,
	kind: ImportJobKind,
	csvText: string,
	opts: { recovery: boolean },
): Promise<ImportJobView> {
	const slug = nanoid(21);
	const sealed = encryptValue(requireDataKey(userId), csvText, jobAAD(userId, slug));
	const [row] = await db
		.insert(importJobs)
		.values({
			slug,
			userId,
			kind,
			status: "queued",
			recovery: opts.recovery,
			payload: sealed,
			// Explicit timestamps: SQLite's CURRENT_TIMESTAMP default is a
			// text value that the integer-timestamp driver maps to an
			// Invalid Date on read-back (same reason upsertMonth passes
			// updatedAt explicitly).
			createdAt: new Date(),
		})
		.returning({ slug: importJobs.slug, createdAt: importJobs.createdAt });

	devLog("import-jobs:enqueue", `Job queued (${kind})`, { userId, slug });

	// Fire-and-forget: the loop claims atomically, so a second kick while
	// one is running is harmless.
	void runImportWorker();

	return {
		slug: row.slug,
		kind,
		status: "queued",
		rowsTotal: 0,
		errorMessage: null,
		resultCounts: null,
		createdAt: row.createdAt.toISOString(),
		startedAt: null,
		finishedAt: null,
	};
}

export async function listImportJobs(userId: number): Promise<ImportJobView[]> {
	await sweepOrphans();
	const rows = await db
		.select()
		.from(importJobs)
		.where(withUserFilter(userId, importJobs))
		.orderBy(desc(importJobs.id))
		.limit(50);
	return rows.map(toView);
}

function toView(row: typeof importJobs.$inferSelect): ImportJobView {
	const iso = (value: Date | null): string | null => {
		if (value === null) return null;
		const time = value.getTime();
		return Number.isFinite(time) ? value.toISOString() : "—";
	};
	return {
		slug: row.slug,
		kind: row.kind,
		status: row.status,
		rowsTotal: row.rowsTotal,
		errorMessage: row.errorMessage,
		resultCounts: row.resultCounts ? JSON.parse(row.resultCounts) : null,
		createdAt: iso(row.createdAt) ?? "—",
		startedAt: iso(row.startedAt),
		finishedAt: iso(row.finishedAt),
	};
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

let workerChain: Promise<void> = Promise.resolve();

/**
 * Run (or join) the drain loop. Concurrent callers coalesce onto the same
 * chain — an enqueue-time kick and an explicit await both observe the
 * same drain to completion.
 */
export function runImportWorker(): Promise<void> {
	workerChain = workerChain.then(drainQueue);
	return workerChain;
}

async function drainQueue(): Promise<void> {
	try {
		// Drain the queue; each job is one engine commit (atomic per file).
		// executeJob swallows its own errors; only claim failures land here.
		for (;;) {
			const job = await claimNext();
			if (!job) break;
			await executeJob(job);
		}
	} catch (err) {
		logError("import-jobs:worker", "Worker loop failed", err);
	}
}

/** Fail 'running' jobs whose executor vanished (server restart mid-job). */
async function sweepOrphans(): Promise<void> {
	const cutoff = new Date(Date.now() - 10 * 60 * 1000);
	await db
		.update(importJobs)
		.set({
			status: "failed",
			errorMessage: "interrupted (executor went away)",
			finishedAt: new Date(),
		})
		.where(
			and(
				eq(importJobs.status, "running"),
				lt(importJobs.startedAt, cutoff),
			),
		);
}

interface ClaimedJob {
	id: number;
	slug: string;
	userId: number;
	kind: string;
	recovery: boolean;
	payload: string;
}

async function claimNext(): Promise<ClaimedJob | null> {
	const claimed = await db
		.update(importJobs)
		.set({ status: "running", startedAt: new Date() })
		.where(
			sql`${importJobs.id} = (
				SELECT ${importJobs.id} FROM ${importJobs}
				WHERE ${importJobs.status} = 'queued'
				ORDER BY ${importJobs.id} ASC
				LIMIT 1
			) AND ${importJobs.status} = 'queued'`,
		)
		.returning({
			id: importJobs.id,
			slug: importJobs.slug,
			userId: importJobs.userId,
			kind: importJobs.kind,
			recovery: importJobs.recovery,
			payload: importJobs.payload,
		});
	return claimed[0] ?? null;
}

async function executeJob(job: ClaimedJob): Promise<void> {
	let csvText: string;
	try {
		csvText = decryptValue(
			requireDataKey(job.userId),
			job.payload,
			jobAAD(job.userId, job.slug),
		);
	} catch {
		await db
			.update(importJobs)
			.set({
				status: "failed",
				errorMessage: "payload failed to decrypt (key changed?)",
				finishedAt: new Date(),
			})
			.where(eq(importJobs.id, job.id));
		return;
	}

	try {
		if (job.kind === "transactions") {
			const result = await commitReimport(job.userId, csvText, {
				recovery: job.recovery,
			});
			if ("errors" in result) {
				await failJob(job.id, result.errors[0] ?? "file refused");
				return;
			}
			await finishJob(job.id, result.counts, result.counts.inserted + result.counts.skipped + result.counts.edited + result.counts.deleted);
			return;
		}
		if (job.kind === "history_expenses" || job.kind === "history_income") {
			const result = await commitHistoryImport(
				job.userId,
				job.kind === "history_expenses" ? "expenses" : "income",
				csvText,
			);
			if (!result.ok) {
				await failJob(job.id, result.errors[0] ?? "file refused");
				return;
			}
			const c = result.counts;
			await finishJob(
				job.id,
				c,
				c.inserted + c.edited + c.deleted + c.skipped,
			);
			return;
		}
		await failJob(job.id, `unknown job kind '${job.kind}'`);
	} catch (err) {
		logError("import-jobs:execute", `Job ${job.slug} execution failed`, err);
		await failJob(job.id, "internal error while applying the file");
	}
}

type AnyCounts = {
	inserted: number;
	edited: number;
	deleted: number;
	skipped: number;
};

async function finishJob(
	id: number,
	counts: AnyCounts,
	rowsTotal: number,
): Promise<void> {
	await db
		.update(importJobs)
		.set({
			status: "done",
			resultCounts: JSON.stringify(counts),
			rowsTotal,
			finishedAt: new Date(),
		})
		.where(eq(importJobs.id, id));
}

async function failJob(id: number, message: string): Promise<void> {
	await db
		.update(importJobs)
		.set({
			status: "failed",
			errorMessage: message.slice(0, 300),
			finishedAt: new Date(),
		})
		.where(eq(importJobs.id, id));
}
