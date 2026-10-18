import { relations, sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/**
 * Tax band history — dated bands keyed by whole UK tax years.
 *
 * Canonical tax year strings are "YYYY/YY" (e.g. "2026/27", 6 Apr 2026 – 5 Apr 2027).
 * Bands are tax-year-atomic: a mid-year salary change records as a band change
 * from the tax year containing the change and applies to that entire year.
 * `toTaxYear` null = open-ended (still in effect for later years).
 * Overlapping ranges for a user are rejected by the resolver layer
 * (`src/lib/server/tax-bands.ts`).
 */
export const taxBandHistory = sqliteTable(
	"tax_band_history",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		band: text("band", { enum: ["basic", "higher", "additional"] }).notNull(),
		fromTaxYear: text("from_tax_year").notNull(), // "YYYY/YY"
		toTaxYear: text("to_tax_year"), // "YYYY/YY" or null (open-ended)
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userFromIdx: uniqueIndex("idx_tax_band_history_user_from").on(
			table.userId,
			table.fromTaxYear,
		),
	}),
);

/**
 * Monthly gross income history.
 *
 * One row per user per month ("YYYY-MM"). A present row means the month's
 * gross income is known — including £0. An absent row means unknown,
 * never zero by default. Multi-year backfill via range-fill in the UI.
 */
export const incomeHistory = sqliteTable(
	"income_history",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		month: text("month").notNull(), // "YYYY-MM"
		grossIncomeInCents: integer("gross_income_in_cents").notNull(), // >= 0
		note: text("note"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userMonthIdx: uniqueIndex("idx_income_history_user_month").on(
			table.userId,
			table.month,
		),
	}),
);

export const taxBandHistoryRelations = relations(taxBandHistory, ({ one }) => ({
	user: one(users, {
		fields: [taxBandHistory.userId],
		references: [users.id],
	}),
}));

export const incomeHistoryRelations = relations(incomeHistory, ({ one }) => ({
	user: one(users, {
		fields: [incomeHistory.userId],
		references: [users.id],
	}),
}));

export type TaxBandHistoryRow = typeof taxBandHistory.$inferSelect;
export type IncomeHistoryRow = typeof incomeHistory.$inferSelect;
