import { relations } from "drizzle-orm/relations";
import { users, accounts, backupCodes, goalAllocations, goals, interestRates, sessions, snapshots, accountTransactions } from "./schema";

export const accountsRelations = relations(accounts, ({one, many}) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id]
	}),
	goalAllocations: many(goalAllocations),
	interestRates: many(interestRates),
	accountTransactions: many(accountTransactions),
}));

export const usersRelations = relations(users, ({many}) => ({
	accounts: many(accounts),
	backupCodes: many(backupCodes),
	goals: many(goals),
	sessions: many(sessions),
	snapshots: many(snapshots),
}));

export const backupCodesRelations = relations(backupCodes, ({one}) => ({
	user: one(users, {
		fields: [backupCodes.userId],
		references: [users.id]
	}),
}));

export const goalAllocationsRelations = relations(goalAllocations, ({one}) => ({
	account: one(accounts, {
		fields: [goalAllocations.accountId],
		references: [accounts.id]
	}),
	goal: one(goals, {
		fields: [goalAllocations.goalId],
		references: [goals.id]
	}),
}));

export const goalsRelations = relations(goals, ({one, many}) => ({
	goalAllocations: many(goalAllocations),
	user: one(users, {
		fields: [goals.userId],
		references: [users.id]
	}),
}));

export const interestRatesRelations = relations(interestRates, ({one}) => ({
	account: one(accounts, {
		fields: [interestRates.accountId],
		references: [accounts.id]
	}),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
}));

export const snapshotsRelations = relations(snapshots, ({one}) => ({
	user: one(users, {
		fields: [snapshots.userId],
		references: [users.id]
	}),
}));

export const accountTransactionsRelations = relations(accountTransactions, ({one}) => ({
	account: one(accounts, {
		fields: [accountTransactions.accountId],
		references: [accounts.id]
	}),
}));