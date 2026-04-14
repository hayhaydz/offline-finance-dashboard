/** Payment rule for debt accounts */
export interface PaymentRule {
	type: "flat" | "percentage" | "flat_or_percentage";
	flat?: number;       // pence
	percentage?: number; // basis points
}

/** Single month projection row */
export interface MonthProjection {
	month: number;
	balance: number;
	interest: number;
	payment: number;
}

/** Time-to-zero calculation result */
export interface TTZResult {
	months: number | null;
	years: number | null;
	totalInterest: number | null;
	projection: MonthProjection[];
}

/** Payoff projection — nullable fields for "never pays off" case */
export interface PayoffProjection {
	months: number | null;
	projectedPayoffDate: Date | null;
	totalInterestInCents: number | null;
}

/** Input for debt strategy calculations */
export interface DebtGoalInput {
	goalId: number;
	slug: string;
	name: string;
	remainingInCents: number;
	aprBasisPoints: number | null;
	minimumMonthlyInCents: number;
}

/** Debt goal with attached payoff projection */
export interface DebtGoalWithProjection extends DebtGoalInput {
	projectedPayoffDate: Date | null;
	totalInterestInCents: number | null;
}

/** Metrics for debt strategy comparison (avalanche vs snowball vs hybrid) */
export interface DebtStrategyMetrics {
	totalDebtInCents: number;
	totalMonthlyMinimumInCents: number;
	projectedDebtFreeDate: Date | null;
	snowballOrder: DebtGoalWithProjection[];
	avalancheOrder: DebtGoalWithProjection[];
	hybridOrder: DebtGoalWithProjection[];
	interestSavedByAvalancheInCents: number | null;
	monthsSavedByAvalanche: number | null;
}

/** Overpayment scenario comparison row */
export interface OverpaymentScenario {
	label: string;
	payment: number;
	ttzMonths: number | null;
	totalInterest: number | null;
	debtFreeDate: string | null;
}

/** Rate stress test scenario row */
export interface RateStressScenario {
	label: string;
	rate: number;
	ttzMonths: number | null;
	ttzDelta: number | null;
	totalInterest: number | null;
	debtFreeDate: string | null;
}
