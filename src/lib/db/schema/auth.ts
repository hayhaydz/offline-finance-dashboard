import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { goals } from "./goals";
import {
	budgetMonths,
	monthlyReviews,
	spendingCategories,
	snapshots,
} from "./system";

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
	inactivityTimeout: integer("inactivity_timeout").default(5), // Minutes of inactivity before session expiry
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

export const backupCodes = sqliteTable(
	"backup_codes",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		code: text("code").notNull(), // Hashed with Argon2id
		used: integer("used", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => ({
		userIdUsedIdx: index("idx_backup_codes_user_id_used").on(
			table.userId,
			table.used,
		),
	}),
);

export const loginAttempts = sqliteTable(
	"login_attempts",
	{
		username: text("username").primaryKey(),
		count: integer("count").notNull().default(0),
		lastAttempt: integer("last_attempt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		lockedUntil: integer("locked_until", { mode: "timestamp" }),
	},
	(table) => ({
		lastAttemptIdx: index("idx_login_attempts_last_attempt").on(table.lastAttempt),
		lockedUntilIdx: index("idx_login_attempts_locked_until").on(table.lockedUntil),
	}),
);

// Auth relations
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	backupCodes: many(backupCodes),
	accounts: many(accounts),
	goals: many(goals),
	snapshots: many(snapshots),
	monthlyReviews: many(monthlyReviews),
	spendingCategories: many(spendingCategories),
	budgetMonths: many(budgetMonths),
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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
