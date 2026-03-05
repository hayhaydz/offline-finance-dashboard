import { sqliteTable, type AnySQLiteColumn, index, uniqueIndex, foreignKey, integer, text } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const accounts = sqliteTable("accounts", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	slug: text().notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	name: text().notNull(),
	institution: text(),
	type: text().notNull(),
	taxWrapper: text("tax_wrapper").default("none").notNull(),
	category: text().notNull(),
	liquidity: text(),
	excludedFromNetWorth: integer("excluded_from_net_worth").default(0).notNull(),
	closedAt: integer("closed_at"),
	maturityDate: integer("maturity_date"),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: integer("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_accounts_user_excluded_closed").on(table.userId, table.excludedFromNetWorth, table.closedAt),
	index("idx_accounts_user_closed").on(table.userId, table.closedAt),
	uniqueIndex("accounts_slug_unique").on(table.slug),
]);

export const backupCodes = sqliteTable("backup_codes", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	code: text().notNull(),
	used: integer().default(0).notNull(),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const goalAllocations = sqliteTable("goal_allocations", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	goalId: integer("goal_id").notNull().references(() => goals.id),
	accountId: integer("account_id").references(() => accounts.id),
	amount: integer().notNull(),
	type: text().notNull(),
	allocationDate: integer("allocation_date").notNull(),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_goal_allocations_account").on(table.accountId),
	index("idx_goal_allocations_goal").on(table.goalId),
]);

export const goals = sqliteTable("goals", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	slug: text().notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	name: text().notNull(),
	targetAmountInCents: integer("target_amount_in_cents").notNull(),
	currentAllocation: integer("current_allocation").default(0).notNull(),
	targetDate: integer("target_date"),
	isEmergencyFund: integer("is_emergency_fund").default(0).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	deletedAt: integer("deleted_at"),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: integer("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_goals_user_deleted_sort").on(table.userId, table.deletedAt, table.sortOrder),
	uniqueIndex("goals_slug_unique").on(table.slug),
]);

export const interestRates = sqliteTable("interest_rates", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	accountId: integer("account_id").notNull().references(() => accounts.id),
	rate: integer().notNull(),
	effectiveFrom: integer("effective_from").notNull(),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_interest_rates_account_effective").on(table.accountId, table.effectiveFrom),
]);

export const loginAttempts = sqliteTable("login_attempts", {
	username: text().primaryKey().notNull(),
	count: integer().default(0).notNull(),
	lastAttempt: integer("last_attempt").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	lockedUntil: integer("locked_until"),
});

export const sessions = sqliteTable("sessions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	token: text().notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	lastActivity: integer("last_activity").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_sessions_user_last_activity").on(table.userId, table.lastActivity),
	uniqueIndex("sessions_token_unique").on(table.token),
]);

export const snapshots = sqliteTable("snapshots", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	slug: text().notNull(),
	userId: integer("user_id").notNull().references(() => users.id),
	snapshotDate: text("snapshot_date").notNull(),
	netWorthInCents: integer("net_worth_in_cents").notNull(),
	totalAssetsInCents: integer("total_assets_in_cents").notNull(),
	totalLiabilitiesInCents: integer("total_liabilities_in_cents").notNull(),
	totalAllocatedInCents: integer("total_allocated_in_cents").default(0).notNull(),
	accountsBreakdown: text("accounts_breakdown"),
	goalsBreakdown: text("goals_breakdown"),
	notes: text(),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_snapshots_slug").on(table.slug),
	index("idx_snapshots_user_date").on(table.userId, table.snapshotDate),
	uniqueIndex("snapshots_slug_unique").on(table.slug),
]);

export const systemMetadata = sqliteTable("system_metadata", {
	key: text().primaryKey().notNull(),
	value: text().notNull(),
});

export const users = sqliteTable("users", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	username: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	totpSecret: text("totp_secret").notNull(),
	totpSecretIv: text("totp_secret_iv").notNull(),
	passwordSalt: text("password_salt").notNull(),
	mfaSetupToken: text("mfa_setup_token"),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: integer("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	uniqueIndex("users_username_unique").on(table.username),
]);

export const accountTransactions = sqliteTable("account_transactions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	slug: text().notNull(),
	accountId: integer("account_id").notNull().references(() => accounts.id),
	type: text().notNull(),
	amount: integer().notNull(),
	category: text(),
	description: text(),
	transactionDate: integer("transaction_date").notNull(),
	createdAt: integer("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_account_transactions_type").on(table.type),
	index("idx_account_transactions_account_date").on(table.accountId, table.transactionDate),
	uniqueIndex("account_transactions_slug_unique").on(table.slug),
]);

