import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { goals } from "./goals";
import {
	budgetMonths,
	monthlyReviews,
	snapshots,
	spendingCategories,
} from "./system";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	passwordSalt: text("password_salt").notNull(), // Salt for user key derivation
	taxBand: text("tax_band", { enum: ["basic", "higher", "additional"] })
		.notNull()
		.default("basic"), // UK Personal Savings Allowance tier
	inactivityTimeout: integer("inactivity_timeout").default(5), // Minutes of inactivity before session expiry
	// L2 per-account device-slot (WebAuthn PRF) enrollment switch. Gates NEW
	// enrollment for THIS account only — enforcement for already-enrolled
	// slots is never gated (turning this off revokes the device slots via a
	// full-unlock-guarded settings action, per spec unlock-ceremony).
	deviceEnrollmentEnabled: integer("device_enrollment_enabled", {
		mode: "boolean",
	})
		.notNull()
		.default(false),
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

/**
 * Envelope keyring (openspec/changes/envelope-encryption-keyring).
 *
 * Each credential (password, WebAuthn PRF, recovery passphrase, future
 * kinds) wraps an independent copy of the user's DataKey:
 *   wrappedKey/iv = AES-256-GCM(credential_key, DataKey, AAD=kind|userId|slotId)
 *
 * Adding/rotating/revoking a credential only adds/rewrites/removes its row —
 * user data is never re-encrypted by credential changes. Future slot kinds
 * (L3 Android app share, L4 hardware key) are new `kind` values, not schema
 * changes. The slot table alone is useless without its off-disk secrets —
 * backing it up is an availability aid, never a confidentiality risk.
 */
export const credentialSlots = sqliteTable(
	"credential_slots",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slotId: text("slot_id").notNull().unique(), // CSPRNG hex — AAD binding + revocation reference (never URL-exposed)
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind", {
			enum: ["password", "webauthn-prf", "recovery-passphrase"],
		}).notNull(),
		wrappedKey: text("wrapped_key").notNull(), // Hex ciphertext + GCM tag
		iv: text("iv").notNull(), // Hex 12-byte GCM IV
		// Kind-specific credential metadata (JSON): salt (recovery/PRF),
		// label, webauthn credential id / public key, device name.
		metadata: text("metadata", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'`),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		revokedAt: integer("revoked_at", { mode: "timestamp" }), // NULL = active
	},
	(table) => ({
		userKindIdx: index("idx_credential_slots_user_kind").on(
			table.userId,
			table.kind,
			table.revokedAt,
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
		lastAttemptIdx: index("idx_login_attempts_last_attempt").on(
			table.lastAttempt,
		),
		lockedUntilIdx: index("idx_login_attempts_locked_until").on(
			table.lockedUntil,
		),
	}),
);

// Auth relations
export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	credentialSlots: many(credentialSlots),
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

export const credentialSlotsRelations = relations(
	credentialSlots,
	({ one }) => ({
		user: one(users, {
			fields: [credentialSlots.userId],
			references: [users.id],
		}),
	}),
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type CredentialSlot = typeof credentialSlots.$inferSelect;
