import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { spendingCategories } from "./system";

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

// Account relations
export const accountsRelations = relations(accounts, ({ many }) => ({
	transactions: many(accountTransactions),
	interestRates: many(interestRates),
	notes: many(accountNotes),
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

export type Account = typeof accounts.$inferSelect;
export type AccountTransaction = typeof accountTransactions.$inferSelect;
export type InterestRate = typeof interestRates.$inferSelect;
export type AccountNote = typeof accountNotes.$inferSelect;
