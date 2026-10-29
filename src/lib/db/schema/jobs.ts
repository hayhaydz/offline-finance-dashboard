import { relations } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

/**
 * Background import jobs (v3 B06 slice S4, R22).
 *
 * Large CSV imports (and later bulk history uploads) run through this
 * queue instead of a blocking form post: the upload is accepted
 * immediately, execution happens in the dev-server process, and the UI
 * polls for progress. Payloads are sealed under the owner's DataKey
 * (same versioned codec as backups) — no plaintext CSV at rest.
 *
 * A job row is deliberately tiny and API-safe: the CSV itself never
 * leaves the server, only counts and the first refusal error are
 * reported.
 */
export const importJobs = sqliteTable(
	"import_jobs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(), // nanoid(21) — job id in URLs/polls
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind").notNull(), // transactions | history_expenses | history_income
		status: text("status").notNull().default("queued"), // queued|running|done|failed
		recovery: integer("recovery", { mode: "boolean" })
			.notNull()
			.default(false),
		payload: text("payload").notNull(), // sealed CSV (v1| ciphertext)
		rowsTotal: integer("rows_total").notNull().default(0),
		errorMessage: text("error_message"), // first refusal error (no personal data)
		resultCounts: text("result_counts"), // JSON counts summary
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		startedAt: integer("started_at", { mode: "timestamp" }),
		finishedAt: integer("finished_at", { mode: "timestamp" }),
	},
	(table) => ({
		userIdx: index("idx_import_jobs_user").on(table.userId, table.status),
		statusIdx: index("idx_import_jobs_status").on(table.status, table.id),
	}),
);

export const importJobsRelations = relations(importJobs, ({ one }) => ({
	user: one(users, {
		fields: [importJobs.userId],
		references: [users.id],
	}),
}));

export type ImportJob = typeof importJobs.$inferSelect;
