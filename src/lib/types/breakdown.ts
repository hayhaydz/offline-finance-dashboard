/**
 * Breakdown Type Definitions
 *
 * Central type definitions for interest and ISA breakdown reporting.
 * Extracted from server modules to provide a single source of truth.
 *
 * Re-exported by interestBreakdown.ts and isaBreakdown.ts for backward compatibility.
 */

// --- Interest Breakdown Types ---

/**
 * Interest transaction with account details for traceability
 */
export interface InterestTransaction {
	id: number;
	slug: string;
	transactionDate: Date;
	type: string; // 'interest' or 'interest_accrued' or 'opening'
	amount: number; // in cents
	description: string | null;
	runningTotal: number; // cumulative total in cents

	// Account details
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;
}

/**
 * Account breakdown with interest totals
 */
export interface AccountBreakdown {
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;
	total: number; // in cents
	transactionCount: number;
}

/**
 * Monthly breakdown of interest
 */
export interface MonthBreakdown {
	year: number;
	month: number; // 1-12
	monthName: string; // e.g., "April"
	total: number; // in cents
	transactionCount: number;
}

/**
 * Institution breakdown of interest
 */
export interface InstitutionBreakdown {
	institution: string;
	total: number; // in cents
	transactionCount: number;
}

/**
 * Tax wrapper breakdown of interest
 */
export interface TaxWrapperBreakdown {
	taxWrapper: string;
	total: number; // in cents
	transactionCount: number;
	isTaxFree: boolean;
}

/**
 * Actual interest breakdown with all dimensions
 */
export interface ActualInterestBreakdown {
	total: number; // in cents
	taxableTotal: number; // in cents
	taxFreeTotal: number; // in cents
	byAccount: AccountBreakdown[];
	byMonth: MonthBreakdown[];
	byInstitution: InstitutionBreakdown[];
	byTaxWrapper: TaxWrapperBreakdown[];
	transactions: InterestTransaction[];
}

/**
 * Projected interest per-account with assumptions
 */
export interface ProjectedAccountBreakdown {
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;

	// Projection inputs
	balanceInCents: number;
	rateBasisPoints: number | null;
	maturityDate: Date | null;
	daysUntilMaturity: number | null;
	daysUntilTaxYearEnd: number;

	// Calculated projection
	projectedInterest: number; // in cents

	// Exclusion reason (null if included)
	exclusionReason:
		| null
		| "no_balance"
		| "no_rate"
		| "already_matured"
		| "matures_after_tax_year"
		| "closed_account"
		| "non_interest_bearing";
}

/**
 * Projected interest breakdown for remaining tax year
 */
export interface ProjectedInterestBreakdown {
	total: number; // in cents
	taxableTotal: number; // in cents
	taxFreeTotal: number; // in cents
	byAccount: ProjectedAccountBreakdown[];
}

/**
 * Forecast combining actual and projected interest
 */
export interface InterestForecast {
	total: number; // in cents (actual + projected)
	taxableTotal: number; // in cents
	taxFreeTotal: number; // in cents
	psaStatusNow: import("$lib/utils/tax-year-utils").TaxFreeStatus; // Personal Savings Allowance status (actual only)
	psaStatusForecast: import("$lib/utils/tax-year-utils").TaxFreeStatus; // PSA status (actual + projected)
}

/**
 * Category identifiers for reconciliation checks.
 * Covers both interest and ISA breakdown reconciliation.
 */
export type ReconciliationCategory =
	| "transactions"
	| "by_account"
	| "by_month"
	| "allowance";

/**
 * Reconciliation flags for data validation.
 * Single source of truth — used by both interestBreakdown and ISA breakdown modules.
 */
export interface ReconciliationFlag {
	type: "warning" | "error";
	category: ReconciliationCategory;
	message: string;
	delta?: number; // difference in cents
}

/**
 * Reconciliation report for validation
 */
export interface InterestReconciliationReport {
	actualVsTransactionsDelta: number; // should be 0
	actualVsByAccountDelta: number; // should be 0
	actualVsByMonthDelta: number; // should be 0
	flags: ReconciliationFlag[];
}

/**
 * Meta information about the request
 */
export interface InterestBreakdownMeta {
	taxYearStart: Date;
	taxYearEnd: Date;
	asOfDate: Date | null; // null if not provided
	daysRemainingInTaxYear: number;
}

/**
 * Complete interest breakdown payload
 */
export interface InterestBreakdownReport {
	meta: InterestBreakdownMeta;
	actual: ActualInterestBreakdown;
	projected: ProjectedInterestBreakdown;
	forecast: InterestForecast;
	reconciliation: InterestReconciliationReport;
}

/**
 * Single-account interest summary with projection eligibility
 */
export interface AccountInterestSummary {
	// Actual interest earned in tax year (always present if account type qualifies)
	actualInterest: number; // in cents

	// Projected interest for remaining tax year (may be 0 if excluded)
	projectedInterest: number; // in cents

	// Total expected interest (actual + projected)
	totalExpectedInterest: number; // in cents

	// Why projections were excluded (null if projections are valid)
	projectionExclusionReason: ProjectedAccountBreakdown["exclusionReason"];

	// Tax year bounds
	taxYearStart: Date;
	taxYearEnd: Date;

	// Tax-free status (Personal Savings Allowance)
	taxFreeStatus: import("$lib/utils/tax-year-utils").TaxFreeStatus;
}

// --- ISA Breakdown Types ---

/**
 * ISA subscription transaction with account details
 */
export interface ISATransaction {
	id: number;
	slug: string;
	transactionDate: Date;
	type: string; // 'deposit', 'transfer_in' (excluded from allowance)
	amount: number; // in cents
	description: string | null;
	runningTotal: number; // cumulative subscription in cents

	// Account details
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string; // 'isa', 'lisa', 'premium-bonds'
}

/**
 * Account breakdown of ISA subscriptions
 */
export interface ISAAccountBreakdown {
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;
	total: number; // in cents subscribed this tax year
	transactionCount: number;
}

/**
 * Monthly breakdown of ISA subscriptions
 */
export interface ISAMonthBreakdown {
	year: number;
	month: number; // 1-12
	monthName: string; // e.g., "April"
	total: number; // in cents subscribed
	transactionCount: number;
}

/**
 * Institution breakdown of ISA subscriptions
 */
export interface ISAInstitutionBreakdown {
	institution: string;
	total: number; // in cents subscribed
	transactionCount: number;
}

/**
 * Tax wrapper breakdown (ISA vs LISA vs Premium Bonds)
 */
export interface ISATaxWrapperBreakdown {
	taxWrapper: string;
	total: number; // in cents subscribed
	transactionCount: number;
	displayName: string; // "ISA", "LISA", "Premium Bonds"
}

/**
 * Meta information about the tax year and allowance status
 */
export interface ISAMeta {
	taxYearStart: Date;
	taxYearEnd: Date;
	taxYearLabel: string; // "2025-26"
	asOfDate: Date;
	daysRemainingInTaxYear: number;
	allowanceInCents: number; // 20_000_00
	allowanceUsed: number; // in cents
	allowanceRemaining: number; // in cents
	utilizationPercent: number; // 0-100
	overAllowance: boolean;
}

/**
 * Actual ISA subscriptions breakdown with all dimensions
 */
export interface ISAActualBreakdown {
	total: number; // in cents subscribed
	byAccount: ISAAccountBreakdown[];
	byMonth: ISAMonthBreakdown[];
	byInstitution: ISAInstitutionBreakdown[];
	byTaxWrapper: ISATaxWrapperBreakdown[];
	transactions: ISATransaction[];
}

/**
 * ISA subscription reconciliation for data integrity
 */
export interface ISAReconciliation {
	totalVsByAccountDelta: number; // Should be 0
	totalVsByMonthDelta: number; // Should be 0
	totalVsTransactionsDelta: number; // Should be 0
	flags: ReconciliationFlag[];
}

/**
 * Complete ISA breakdown report
 */
export interface ISABreakdownReport {
	meta: ISAMeta;
	actual: ISAActualBreakdown;
	reconciliation: ISAReconciliation;
}
