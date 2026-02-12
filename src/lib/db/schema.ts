import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	totpSecret: text('totp_secret').notNull(), // Encrypted with system key
	totpSecretIV: text('totp_secret_iv').notNull(), // IV for TOTP secret encryption
	passwordSalt: text('password_salt').notNull(), // Salt for user key derivation
	mfaSetupToken: text('mfa_setup_token'), // Temporary token for MFA setup flow
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const sessions = sqliteTable('sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	token: text('token').notNull().unique(), // Opaque session token
	userId: integer('user_id').notNull().references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
	lastActivity: integer('last_activity', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const backupCodes = sqliteTable('backup_codes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull().references(() => users.id),
	code: text('code').notNull(), // Hashed with Argon2id
	used: integer('used', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const loginAttempts = sqliteTable('login_attempts', {
	username: text('username').primaryKey(),
	count: integer('count').notNull().default(0),
	lastAttempt: integer('last_attempt', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
	lockedUntil: integer('locked_until', { mode: 'timestamp' })
});

export const accounts = sqliteTable('accounts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(), // URL-safe identifier for user-facing routes
	userId: integer('user_id').notNull().references(() => users.id),
	name: text('name').notNull(),
	institution: text('institution'),
	type: text('type', { enum: ['current', 'savings', 'investment', 'credit-card', 'loan', 'mortgage'] }).notNull(),
	taxWrapper: text('tax_wrapper', { enum: ['none', 'isa', 'lisa'] }).notNull().default('none'),
	category: text('category', { enum: ['asset', 'liability'] }).notNull(),
	liquidity: text('liquidity', { enum: ['instant', 'delayed', 'locked'] }),
	excludedFromNetWorth: integer('excluded_from_net_worth', { mode: 'boolean' }).notNull().default(false),
	closedAt: integer('closed_at', { mode: 'timestamp' }), // Soft-delete - NULL means open
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const accountBalances = sqliteTable('account_balances', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(), // URL-safe identifier for user-facing routes
	accountId: integer('account_id').notNull().references(() => accounts.id),
	balanceInCents: integer('balance_in_cents').notNull(), // Stored as cents/pence (integer)
	asOfDate: integer('as_of_date', { mode: 'timestamp' }).notNull(),
	notes: text('notes'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const goals = sqliteTable('goals', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(), // URL-safe identifier for user-facing routes
	userId: integer('user_id').notNull().references(() => users.id),
	name: text('name').notNull(),
	targetAmountInCents: integer('target_amount_in_cents').notNull(), // Stored as cents/pence (integer)
	isEmergencyFund: integer('is_emergency_fund', { mode: 'boolean' }).notNull().default(false),
	targetDate: integer('target_date', { mode: 'timestamp' }), // Optional target date
	accountTypeFilters: text('account_type_filters').notNull(), // JSON array: ['current', 'savings', 'investment']
	liquidityFilters: text('liquidity_filters').notNull(), // JSON array: ['instant', 'delayed', 'locked']
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const systemMetadata = sqliteTable('system_metadata', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// Define relations for Drizzle ORM
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	backupCodes: many(backupCodes),
	accounts: many(accounts),
	goals: many(goals)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	})
}));

export const backupCodesRelations = relations(backupCodes, ({ one }) => ({
	user: one(users, {
		fields: [backupCodes.userId],
		references: [users.id]
	})
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
	balances: many(accountBalances)
}));

export const accountBalancesRelations = relations(accountBalances, ({ one }) => ({
	account: one(accounts, {
		fields: [accountBalances.accountId],
		references: [accounts.id]
	})
}));

export const goalsRelations = relations(goals, ({ one }) => ({
	user: one(users, {
		fields: [goals.userId],
		references: [users.id]
	})
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type AccountBalance = typeof accountBalances.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type SystemMetadata = typeof systemMetadata.$inferSelect;
