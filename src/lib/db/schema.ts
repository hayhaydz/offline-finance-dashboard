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
		taxWrapper: text("tax_wrapper", { enum: ["none", "isa", "lisa", "premium-bonds"] })
			.notNull()
			.default("none"),
		category: text("category", { enum: ["asset", "liability"] }).notNull(),
		liquidity: text("liquidity", { enum: ["instant", "delayed", "locked"] }),
		excludedFromNetWorth: integer("excluded_from_net_worth", {
			mode: "boolean",
		})
			.notNull()
			.default(false),
		closedAt: integer("closed_at", { mode: "timestamp" }), // Soft-delete - NULL means open
		maturityDate: integer("maturity_date", { mode: "timestamp" }), // For fixed terms/bonds
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
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
				"dividend",
				"value_change",
				"transfer_in",
				"transfer_out",
			],
		}).notNull(),
		amount: integer("amount").notNull(), // Signed cents: + for additions, - for deductions
		category: text("category"), // Nullable, for future budgeting
		description: text("description"),
		transactionDate: integer("transaction_date", { mode: "timestamp" }).notNull(),
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

export const systemMetadata = sqliteTable("system_metadata", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
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
				balanceInCents: number;
				includedInTotal: boolean;
			}>;
			totalByType: Record<string, number>;
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
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
	user: one(users, {
		fields: [goals.userId],
		references: [users.id],
	}),
	allocations: many(goalAllocations),
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

export const accountTransactionsRelations = relations(
	accountTransactions,
	({ one }) => ({
		account: one(accounts, {
			fields: [accountTransactions.accountId],
			references: [accounts.id],
		}),
	}),
);

export const interestRatesRelations = relations(interestRates, ({ one }) => ({
	account: one(accounts, {
		fields: [interestRates.accountId],
		references: [accounts.id],
	}),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
	user: one(users, {
		fields: [snapshots.userId],
		references: [users.id],
	}),
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountTransaction = typeof accountTransactions.$inferSelect;
export type InterestRate = typeof interestRates.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalAllocation = typeof goalAllocations.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type SystemMetadata = typeof systemMetadata.$inferSelect;
