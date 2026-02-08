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

// Define relations for Drizzle ORM
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	backupCodes: many(backupCodes)
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

export const systemMetadata = sqliteTable('system_metadata', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
export type SystemMetadata = typeof systemMetadata.$inferSelect;
