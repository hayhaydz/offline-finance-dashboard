/** Budget configuration for a given month */
export interface BudgetConfig {
	totalTargetInCents: number;
	excludedCategoryIds: number[];
	excludedAccountIds: number[];
	categoryTargets: Record<string, number>;
}

/** Spending breakdown for a single category */
export interface CategoryBreakdown {
	id: number;
	name: string;
	colour: string;
	spent: number;
	target: number | null;
}

/** Computed budget status for a month */
export interface BudgetStatus {
	budget: BudgetConfig | null;
	totalSpent: number;
	daysElapsed: number;
	totalDays: number;
	avgPerDay: number;
	projectedTotal: number;
}
