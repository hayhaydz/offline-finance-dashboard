import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts";
import { users } from "./auth";

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
		reachedAtIdx: index("idx_goal_milestones_reached_at").on(table.reachedAt),
	}),
);

// Goal relations
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

export type Goal = typeof goals.$inferSelect;
export type GoalAllocation = typeof goalAllocations.$inferSelect;
export type GoalMilestone = typeof goalMilestones.$inferSelect;
