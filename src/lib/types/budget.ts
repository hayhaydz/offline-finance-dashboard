import type { TransactionType } from "$lib/utils/domain-constants";

/** Budget configuration for a given month */
export interface BudgetConfig {
	totalTargetInCents: number;
	excludedCategoryIds: number[];
	excludedAccountIds: number[];
	excludedTypes: TransactionType[];
	categoryTargets: Record<string, number>;
}

/** A single recorded budget config change (old → new) */
export interface BudgetAmendment {
	id: number;
	field: string;
	oldValue: unknown;
	newValue: unknown;
	note: string | null;
	createdAt: string; // ISO timestamp
}

/** Amendment with the budget month it belongs to (timeline entries) */
export interface AmendmentTimelineEntry extends BudgetAmendment {
	month: string;
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
