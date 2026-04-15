import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

export const monthlyReviews = sqliteTable(
	"monthly_reviews",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		yearMonth: text("year_month").notNull(), // "YYYY-MM" e.g. "2026-03"
		completedItems: text("completed_items", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userYearMonthIdx: index("idx_monthly_reviews_user_year_month").on(
			table.userId,
			table.yearMonth,
		),
	}),
);

export const systemMetadata = sqliteTable("system_metadata", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

export const spendingCategories = sqliteTable(
	"spending_categories",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(), // Display label: "Groceries"
		key: text("key").notNull(), // URL-safe identifier: "groceries"
		colour: text("colour").notNull(), // Hex string: "#68D391"
		isDefault: integer("is_default", { mode: "boolean" })
			.notNull()
			.default(false),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => ({
		userKeyIdx: index("idx_spending_categories_user_key").on(
			table.userId,
			table.key,
		),
	}),
);

export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

export const snapshots = sqliteTable(
	"snapshots",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		snapshotDate: text("snapshot_date").notNull(), // ISO 8601 date only (YYYY-MM-DD)

		// Primary financial data
		netWorthInCents: integer("net_worth_in_cents").notNull(),
		totalAssetsInCents: integer("total_assets_in_cents").notNull(),
		totalLiabilitiesInCents: integer("total_liabilities_in_cents").notNull(),
		totalAllocatedInCents: integer("total_allocated_in_cents")
			.notNull()
			.default(0),

		// JSON breakdowns for point-in-time preservation
		accountsBreakdown: text("accounts_breakdown", { mode: "json" }).$type<{
			snapshotTakenAt: string;
			accounts: Array<{
				accountId: number;
				accountSlug: string;
				name: string;
				type: string;
				category: "asset" | "liability";
				taxWrapper: "none" | "isa" | "lisa" | "premium-bonds";
				balanceInCents: number;
				includedInTotal: boolean;
				maturityDate: string | null;
			}>;
			totalByType: Record<string, number>;
		}>(),
		interestBreakdown: text("interest_breakdown", { mode: "json" }).$type<{
			snapshotTakenAt: string;
			accounts: Array<{
				accountId: number;
				accountSlug: string;
				name: string;
				currentRate: number | null; // Basis points, null if no rate set
				effectiveFrom: string | null;
			}>;
		}>(),
		goalsBreakdown: text("goals_breakdown", { mode: "json" }).$type<{
			goals: Array<{
				goalId: number;
				goalSlug: string;
				name: string;
				targetAmountInCents: number;
				currentAllocation: number;
				isEmergencyFund: boolean;
			}>;
			totalAllocated: number;
		}>(),
		// ISA allowance tracking (separated from interest for clarity)
		isaBreakdown: text("isa_breakdown", { mode: "json" }).$type<{
			snapshotTakenAt: string;
			snapshotDate: string;
			taxYear: {
				start: string;
				end: string;
				label: string;
			};
			allowance: {
				usedThisTaxYear: number;
				limit: number;
				remaining: number;
				usedThisSnapshotDate: number;
			};
		}>(),

		// Detailed interest breakdown with PSA status
		interestBreakdownDetail: text("interest_breakdown_detail", {
			mode: "json",
		}).$type<{
			snapshotTakenAt: string;
			snapshotDate: string;
			taxYear: {
				start: string;
				end: string;
				label: string;
			};
			actualInterest: {
				taxFree: number;
				taxable: number;
				total: number;
			};
			projectedInterest: {
				taxFree: number;
				taxable: number;
				total: number;
			};
			totalExpected: {
				taxFree: number;
				taxable: number;
				total: number;
			};
			taxPosition: {
				taxBand: "basic" | "higher" | "additional";
				personalSavingsAllowance: {
					allowance: number;
					used: number;
					remaining: number;
					overAllowance: boolean;
					taxableAmount: number;
				};
			};
			byAccount: Array<{
				accountId: number;
				accountSlug: string;
				name: string;
				taxWrapper: "none" | "isa" | "lisa" | "premium-bonds";
				actualInterestEarned: number;
				projectedInterest: number;
				currentRate: number | null;
				balanceInCents: number;
			}>;
		}>(),

		isaAndInterestBreakdown: text("isa_and_interest_breakdown", {
			mode: "json",
		}).$type<{
			snapshotTakenAt: string;
			snapshotDate: string;
			taxYear: {
				start: string;
				end: string;
				label: string;
			};
			isaAllowance: {
				usedThisTaxYear: number;
				limit: number;
				remaining: number;
				usedThisSnapshotDate: number;
			};
			interestSummary: {
				actualInterest: {
					taxFree: number;
					taxable: number;
					total: number;
				};
				projectedInterest: {
					taxFree: number;
					taxable: number;
					total: number;
				};
				totalExpected: {
					taxFree: number;
					taxable: number;
					total: number;
				};
				taxPosition: {
					taxBand: "basic" | "higher" | "additional";
					personalSavingsAllowance: {
						allowance: number;
						used: number;
						remaining: number;
						overAllowance: boolean;
						taxableAmount: number;
					};
				};
				byAccount: Array<{
					accountId: number;
					accountSlug: string;
					name: string;
					taxWrapper: "none" | "isa" | "lisa" | "premium-bonds";
					actualInterestEarned: number;
					projectedInterest: number;
					currentRate: number | null;
					balanceInCents: number;
				}>;
			};
		}>(),

		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userIdx: index("idx_snapshots_user_date").on(
			table.userId,
			table.snapshotDate,
		),
		slugIdx: index("idx_snapshots_slug").on(table.slug),
	}),
);

export const budgetMonths = sqliteTable(
	"budget_months",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		month: text("month").notNull(), // "2026-04" (YYYY-MM)
		totalTargetInCents: integer("total_target_in_cents").notNull().default(0),
		excludedCategoryIds: text("excluded_category_ids").notNull().default("[]"), // JSON array
		excludedAccountIds: text("excluded_account_ids").notNull().default("[]"), // JSON array
		categoryTargets: text("category_targets").notNull().default("{}"), // JSON object: categoryId → cents
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userMonthIdx: index("idx_budget_months_user_month").on(
			table.userId,
			table.month,
		),
	}),
);

// System relations
export const snapshotsRelations = relations(snapshots, ({ one }) => ({
	user: one(users, {
		fields: [snapshots.userId],
		references: [users.id],
	}),
}));

export const monthlyReviewsRelations = relations(monthlyReviews, ({ one }) => ({
	user: one(users, {
		fields: [monthlyReviews.userId],
		references: [users.id],
	}),
}));

export const spendingCategoriesRelations = relations(spendingCategories, ({ one }) => ({
	user: one(users, {
		fields: [spendingCategories.userId],
		references: [users.id],
	}),
}));

export const budgetMonthsRelations = relations(budgetMonths, ({ one }) => ({
	user: one(users, {
		fields: [budgetMonths.userId],
		references: [users.id],
	}),
}));

export type Snapshot = typeof snapshots.$inferSelect;
export type SystemMetadata = typeof systemMetadata.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type MonthlyReview = typeof monthlyReviews.$inferSelect;
export type SpendingCategory = typeof spendingCategories.$inferSelect;
export type BudgetMonth = typeof budgetMonths.$inferSelect;
