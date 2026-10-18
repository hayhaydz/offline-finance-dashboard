// Auth domain

export type {
	Account,
	AccountNote,
	AccountTransaction,
	InterestRate,
} from "./accounts";

// Account domain
export {
	accountNotes,
	accountNotesRelations,
	accounts,
	accountsRelations,
	accountTransactions,
	accountTransactionsRelations,
	interestRates,
	interestRatesRelations,
} from "./accounts";
// Inferred types
export type { User } from "./auth";
export {
	backupCodes,
	backupCodesRelations,
	loginAttempts,
	sessions,
	sessionsRelations,
	users,
	usersRelations,
} from "./auth";
export type { Goal, GoalAllocation, GoalMilestone } from "./goals";
// Goal domain
export {
	goalAllocations,
	goalAllocationsRelations,
	goalMilestones,
	goalMilestonesRelations,
	goals,
	goalsRelations,
} from "./goals";
export type {
	BudgetConfigAmendment,
	BudgetMonth,
	MonthlyReview,
	Settings,
	Snapshot,
	SpendingCategory,
	SystemMetadata,
} from "./system";
// System domain
export {
	budgetConfigAmendments,
	budgetConfigAmendmentsRelations,
	budgetMonths,
	budgetMonthsRelations,
	monthlyReviews,
	monthlyReviewsRelations,
	settings,
	snapshots,
	snapshotsRelations,
	spendingCategories,
	spendingCategoriesRelations,
	systemMetadata,
} from "./system";
// Tax domain
export type { IncomeHistoryRow, TaxBandHistoryRow } from "./tax";
export {
	incomeHistory,
	incomeHistoryRelations,
	taxBandHistory,
	taxBandHistoryRelations,
} from "./tax";
