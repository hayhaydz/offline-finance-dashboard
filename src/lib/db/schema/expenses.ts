import { relations, sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/**
 * Monthly expenses history.
 *
 * One row per user per month ("YYYY-MM"). A present row means the month's
 * expenses are known — including £0. An absent row means unknown,
 * never zero by default. Mirrors `income_history`. Range-fill in the UI
 * for multi-year backfill.
 */
export const expensesHistory = sqliteTable(
	"expenses_history",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		month: text("month").notNull(), // "YYYY-MM"
		monthlyExpensesInCents: integer("monthly_expenses_in_cents").notNull(), // >= 0
		note: text("note"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userMonthIdx: uniqueIndex("idx_expenses_history_user_month").on(
			table.userId,
			table.month,
		),
	}),
);

export const expensesHistoryRelations = relations(
	expensesHistory,
	({ one }) => ({
		user: one(users, {
			fields: [expensesHistory.userId],
			references: [users.id],
		}),
	}),
);

export type ExpensesHistoryRow = typeof expensesHistory.$inferSelect;
