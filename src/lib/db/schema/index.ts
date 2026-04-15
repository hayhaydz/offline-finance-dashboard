// Auth domain
export {
	users,
	sessions,
	backupCodes,
	loginAttempts,
	usersRelations,
	sessionsRelations,
	backupCodesRelations,
} from "./auth";

// Account domain
export {
	accounts,
	accountTransactions,
	interestRates,
	accountNotes,
	accountsRelations,
	accountTransactionsRelations,
	interestRatesRelations,
	accountNotesRelations,
} from "./accounts";

// Goal domain
export {
	goals,
	goalAllocations,
	goalMilestones,
	goalsRelations,
	goalAllocationsRelations,
	goalMilestonesRelations,
} from "./goals";

// System domain
export {
	monthlyReviews,
	systemMetadata,
	spendingCategories,
	settings,
	snapshots,
	budgetMonths,
	snapshotsRelations,
	monthlyReviewsRelations,
	spendingCategoriesRelations,
	budgetMonthsRelations,
} from "./system";

// Inferred types
export type { User } from "./auth";
export type { Account, AccountTransaction, InterestRate, AccountNote } from "./accounts";
export type { Goal, GoalAllocation, GoalMilestone } from "./goals";
export type {
	Snapshot,
	SystemMetadata,
	Settings,
	MonthlyReview,
	SpendingCategory,
	BudgetMonth,
} from "./system";
