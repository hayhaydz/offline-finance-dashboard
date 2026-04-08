import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	totpSecret: text("totp_secret").notNull(), // Encrypted with system key
	totpSecretIV: text("totp_secret_iv").notNull(), // IV for TOTP secret encryption
	passwordSalt: text("password_salt").notNull(), // Salt for user key derivation
	mfaSetupToken: text("mfa_setup_token"), // Temporary token for MFA setup flow
	taxBand: text("tax_band", { enum: ["basic", "higher", "additional"] })
		.notNull()
		.default("basic"), // UK Personal Savings Allowance tier
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable(
	"sessions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		token: text("token").notNull().unique(), // Opaque session token
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		lastActivity: integer("last_activity", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userActivityIdx: index("idx_sessions_user_last_activity").on(
			table.userId,
			table.lastActivity,
		),
	}),
);

export const backupCodes = sqliteTable("backup_codes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	code: text("code").notNull(), // Hashed with Argon2id
	used: integer("used", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

export const loginAttempts = sqliteTable("login_attempts", {
	username: text("username").primaryKey(),
	count: integer("count").notNull().default(0),
	lastAttempt: integer("last_attempt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	lockedUntil: integer("locked_until", { mode: "timestamp" }),
});

export const accounts = sqliteTable(
	"accounts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(), // URL-safe identifier for user-facing routes
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(),
		institution: text("institution"),
		type: text("type", {
			enum: [
				"current",
				"savings",
				"investment",
				"credit-card",
				"loan",
				"mortgage",
			],
		}).notNull(),
		taxWrapper: text("tax_wrapper", {
			enum: ["none", "isa", "lisa", "premium-bonds"],
		})
			.notNull()
			.default("none"),
		category: text("category", { enum: ["asset", "liability"] }).notNull(),
		liquidity: text("liquidity", { enum: ["instant", "delayed", "locked"] }),
		excludedFromNetWorth: integer("excluded_from_net_worth", {
			mode: "boolean",
		})
			.notNull()
			.default(false),
		openedAt: integer("opened_at", { mode: "timestamp" }), // Real-world account opening date (nullable)
		closedAt: integer("closed_at", { mode: "timestamp" }), // Soft-delete - NULL means open
		maturityDate: integer("maturity_date", { mode: "timestamp" }), // For fixed terms/bonds
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		// Minimum payment rules
		minimumPaymentType: text("minimumPaymentType", {
			enum: ["flat", "percentage", "flat_or_percentage"],
		})
			.notNull()
			.default("flat"),
		minimumPaymentFlat: integer("minimumPaymentFlat").default(0).notNull(),
		minimumPaymentPercentage: integer("minimumPaymentPercentage")
			.default(0)
			.notNull(),
		// Credit and loan tracking
		creditLimit: integer("creditLimit"), // NULL for installment debt
		originalPrincipal: integer("originalPrincipal"), // NULL for revolving debt
	},
	(table) => ({
		userClosedIdx: index("idx_accounts_user_closed").on(
			table.userId,
			table.closedAt,
		),
		userExcludedClosedIdx: index("idx_accounts_user_excluded_closed").on(
			table.userId,
			table.excludedFromNetWorth,
			table.closedAt,
		),
	}),
);

export const accountTransactions = sqliteTable(
	"account_transactions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		accountId: integer("account_id")
			.notNull()
			.references(() => accounts.id),
		type: text("type", {
			enum: [
				"deposit",
				"withdrawal",
				"interest",
				"interest_accrued",
				"dividend",
				"value_change",
				"transfer_in",
				"transfer_out",
				// Liability-specific transaction types
				"charge", // Credit card purchases (increases debt)
				"payment", // Payments toward debt (decreases liability)
				"loan_disbursement", // Initial loan amount received
				"mortgage_disbursement", // Initial mortgage amount received
				"interest_charge", // Interest charged on debt (increases liability)
			],
		}).notNull(),
		amount: integer("amount").notNull(), // Signed cents: + for additions, - for deductions
		categoryId: integer("category_id"),
		description: text("description"),
		transactionDate: integer("transaction_date", {
			mode: "timestamp",
		}).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		accountDateIdx: index("idx_account_transactions_account_date").on(
			table.accountId,
			table.transactionDate,
		),
		typeIdx: index("idx_account_transactions_type").on(table.type),
	}),
);

export const interestRates = sqliteTable(
	"interest_rates",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		accountId: integer("account_id")
			.notNull()
			.references(() => accounts.id),
		rate: integer("rate").notNull(), // Basis points (e.g., 450 = 4.50%)
		effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		accountEffectiveIdx: index("idx_interest_rates_account_effective").on(
			table.accountId,
			table.effectiveFrom,
		),
	}),
);

export const accountNotes = sqliteTable(
	"account_notes",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		accountId: integer("account_id")
			.notNull()
			.references(() => accounts.id),
		content: text("content").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		accountCreatedIdx: index("idx_account_notes_account_created").on(
			table.accountId,
			table.createdAt,
		),
	}),
);

export const goals = sqliteTable(
	"goals",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(),
		targetAmountInCents: integer("target_amount_in_cents").notNull(),
		currentAllocation: integer("current_allocation").notNull().default(0), // Explicit pot tracking
		targetDate: integer("target_date", { mode: "timestamp" }),
		isEmergencyFund: integer("is_emergency_fund", { mode: "boolean" })
			.notNull()
			.default(false),
		sortOrder: integer("sort_order").notNull().default(0), // Manual reordering
		deletedAt: integer("deleted_at", { mode: "timestamp" }), // Soft delete support
		goalType: text("goal_type", { enum: ["savings", "debt"] })
			.notNull()
			.default("savings"),
		linkedAccountId: integer("linked_account_id").references(() => accounts.id),
		startingBalanceInCents: integer("starting_balance_in_cents"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userDeletedSortIdx: index("idx_goals_user_deleted_sort").on(
			table.userId,
			table.deletedAt,
			table.sortOrder,
		),
	}),
);

export const goalAllocations = sqliteTable(
	"goal_allocations",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		goalId: integer("goal_id")
			.notNull()
			.references(() => goals.id),
		accountId: integer("account_id").references(() => accounts.id), // Nullable for returns to Ready to Assign pool
		amount: integer("amount").notNull(), // Signed: + for adds, - for withdrawals
		type: text("type").notNull(), // 'USER_ADD', 'USER_WITHDRAW', 'GOAL_DELETED', 'AUTO_REDUCE_NEGATIVE_BALANCE'
		allocationDate: integer("allocation_date", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		goalIdx: index("idx_goal_allocations_goal").on(table.goalId),
		accountIdx: index("idx_goal_allocations_account").on(table.accountId),
	}),
);

export const goalMilestones = sqliteTable(
	"goal_milestones",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		goalId: integer("goal_id")
			.notNull()
			.references(() => goals.id),
		label: text("label").notNull(),
		thresholdInCents: integer("threshold_in_cents").notNull(),
		reachedAt: integer("reached_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		goalIdx: index("idx_goal_milestones_goal").on(table.goalId),
	}),
);

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

// Define relations for Drizzle ORM
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	backupCodes: many(backupCodes),
	accounts: many(accounts),
	goals: many(goals),
	snapshots: many(snapshots),
	monthlyReviews: many(monthlyReviews),
	spendingCategories: many(spendingCategories),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const backupCodesRelations = relations(backupCodes, ({ one }) => ({
	user: one(users, {
		fields: [backupCodes.userId],
		references: [users.id],
	}),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
	transactions: many(accountTransactions),
	interestRates: many(interestRates),
	notes: many(accountNotes),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
	user: one(users, {
		fields: [goals.userId],
		references: [users.id],
	}),
	allocations: many(goalAllocations),
	milestones: many(goalMilestones),
	linkedAccount: one(accounts, {
		fields: [goals.linkedAccountId],
		references: [accounts.id],
	}),
}));

export const goalAllocationsRelations = relations(
	goalAllocations,
	({ one }) => ({
		goal: one(goals, {
			fields: [goalAllocations.goalId],
			references: [goals.id],
		}),
		account: one(accounts, {
			fields: [goalAllocations.accountId],
			references: [accounts.id],
		}),
	}),
);

export const goalMilestonesRelations = relations(goalMilestones, ({ one }) => ({
	goal: one(goals, {
		fields: [goalMilestones.goalId],
		references: [goals.id],
	}),
}));

export const accountTransactionsRelations = relations(
	accountTransactions,
	({ one }) => ({
		account: one(accounts, {
			fields: [accountTransactions.accountId],
			references: [accounts.id],
		}),
		category: one(spendingCategories, {
			fields: [accountTransactions.categoryId],
			references: [spendingCategories.id],
		}),
	}),
);

export const interestRatesRelations = relations(interestRates, ({ one }) => ({
	account: one(accounts, {
		fields: [interestRates.accountId],
		references: [accounts.id],
	}),
}));

export const accountNotesRelations = relations(accountNotes, ({ one }) => ({
	account: one(accounts, {
		fields: [accountNotes.accountId],
		references: [accounts.id],
	}),
}));

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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountTransaction = typeof accountTransactions.$inferSelect;
export type InterestRate = typeof interestRates.$inferSelect;
export type AccountNote = typeof accountNotes.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalAllocation = typeof goalAllocations.$inferSelect;
export type GoalMilestone = typeof goalMilestones.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type SystemMetadata = typeof systemMetadata.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type MonthlyReview = typeof monthlyReviews.$inferSelect;
export type SpendingCategory = typeof spendingCategories.$inferSelect;
